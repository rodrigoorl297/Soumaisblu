/**
 * SOU+BLU — Gravador de áudio WhatsApp (RecordRTC com fallback MediaRecorder).
 * Preferência: audio/ogg;codecs=opus (compatível com Evolution sendWhatsAppAudio).
 */
(function (global) {
  'use strict';

  const PREFERRED_TYPES = [
    'audio/ogg;codecs=opus',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
  ];

  function pickMimeType() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }
    for (const t of PREFERRED_TYPES) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

  function normalizeMime(type) {
    let mime = String(type || '').split(';')[0].trim().toLowerCase();
    if (!mime.startsWith('audio/')) return 'audio/ogg';
    return mime;
  }

  function extFromMime(mime) {
    const m = normalizeMime(mime);
    if (m.includes('ogg')) return 'ogg';
    if (m.includes('mpeg') || m === 'audio/mp3') return 'mp3';
    if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
    if (m.includes('wav')) return 'wav';
    return 'webm';
  }

  class WaAudioRecorder {
    constructor() {
      this._stream = null;
      this._recorder = null;
      this._recordRtc = null;
      this._chunks = [];
      this._mime = '';
      this._startedAt = 0;
      this._usingRecordRtc = false;
    }

    async start() {
      if (!window.isSecureContext) {
        throw new Error('Microfone exige HTTPS. Abra o site com https://');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microfone não suportado neste navegador.');
      }
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this._mime = pickMimeType();
      this._chunks = [];
      this._startedAt = Date.now();

      if (typeof global.RecordRTC === 'function') {
        this._usingRecordRtc = true;
        const opts = {
          type: 'audio',
          mimeType: this._mime || 'audio/webm',
          numberOfAudioChannels: 1,
          checkForInactiveTracks: true,
          timeSlice: 250,
          disableLogs: true,
        };
        // OGG nativo → StereoAudioRecorder; senão MediaStreamRecorder (webm/opus no Chrome).
        if (this._mime.includes('ogg') && global.RecordRTC.StereoAudioRecorder) {
          opts.recorderType = global.RecordRTC.StereoAudioRecorder;
          opts.mimeType = 'audio/ogg';
        } else if (global.RecordRTC.MediaStreamRecorder) {
          opts.recorderType = global.RecordRTC.MediaStreamRecorder;
        }
        this._recordRtc = new global.RecordRTC(this._stream, opts);
        this._recordRtc.startRecording();
        return { stream: this._stream, mime: this._mime || opts.mimeType || 'audio/webm' };
      }

      if (typeof MediaRecorder === 'undefined') {
        this._cleanupStream();
        throw new Error('Gravação de áudio não suportada neste navegador.');
      }
      this._usingRecordRtc = false;
      const opts = this._mime ? { mimeType: this._mime } : undefined;
      this._recorder = opts ? new MediaRecorder(this._stream, opts) : new MediaRecorder(this._stream);
      this._recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) this._chunks.push(ev.data);
      };
      try {
        this._recorder.start(250);
      } catch (_) {
        this._recorder.start();
      }
      return { stream: this._stream, mime: this._mime || this._recorder.mimeType || 'audio/webm' };
    }

    stop() {
      return new Promise((resolve, reject) => {
        const elapsed = this._startedAt ? Date.now() - this._startedAt : 0;
        if (this._usingRecordRtc && this._recordRtc) {
          this._recordRtc.stopRecording(() => {
            try {
              const blob = this._recordRtc.getBlob();
              const mime = normalizeMime(blob?.type || this._mime || 'audio/ogg');
              this.destroy();
              resolve({ blob, mime, elapsed, ext: extFromMime(mime) });
            } catch (e) {
              this.destroy();
              reject(e);
            }
          });
          return;
        }
        if (!this._recorder) {
          this.destroy();
          resolve({ blob: new Blob([], { type: 'audio/webm' }), mime: 'audio/webm', elapsed, ext: 'webm' });
          return;
        }
        this._recorder.onstop = () => {
          const raw = this._recorder?.mimeType || this._mime || 'audio/webm';
          const mime = normalizeMime(raw);
          const blob = new Blob(this._chunks, { type: mime });
          this.destroy();
          resolve({ blob, mime, elapsed, ext: extFromMime(mime) });
        };
        this._recorder.onerror = (ev) => {
          this.destroy();
          reject(ev?.error || new Error('Erro na gravação.'));
        };
        try {
          if (this._recorder.state !== 'inactive') this._recorder.stop();
          else {
            const mime = normalizeMime(this._mime || 'audio/webm');
            const blob = new Blob(this._chunks, { type: mime });
            this.destroy();
            resolve({ blob, mime, elapsed, ext: extFromMime(mime) });
          }
        } catch (e) {
          this.destroy();
          reject(e);
        }
      });
    }

    cancel() {
      try {
        if (this._usingRecordRtc && this._recordRtc) {
          this._recordRtc.stopRecording(() => {});
        } else if (this._recorder && this._recorder.state !== 'inactive') {
          this._recorder.stop();
        }
      } catch (_) { /* noop */ }
      this.destroy();
    }

    getStream() {
      return this._stream;
    }

    _cleanupStream() {
      try {
        (this._stream?.getTracks?.() || []).forEach((t) => t.stop());
      } catch (_) { /* noop */ }
      this._stream = null;
    }

    destroy() {
      try {
        if (this._recordRtc) {
          this._recordRtc.destroy();
        }
      } catch (_) { /* noop */ }
      this._recordRtc = null;
      this._recorder = null;
      this._chunks = [];
      this._cleanupStream();
      this._usingRecordRtc = false;
    }
  }

  global.WaAudioRecorder = WaAudioRecorder;
  global.WaAudioRecorderUtils = { pickMimeType, normalizeMime, extFromMime };
})(typeof window !== 'undefined' ? window : globalThis);
