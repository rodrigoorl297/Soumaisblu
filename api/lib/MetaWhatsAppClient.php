<?php
declare(strict_types=1);

class MetaWhatsAppClient
{
    private string $token;
    private string $phoneId;

    public function __construct(string $token, string $phoneId)
    {
        $this->token = $token;
        $this->phoneId = $phoneId;
    }

    private function post(string $endpoint, array $data): array
    {
        $url = "https://graph.facebook.com/v19.0/{$this->phoneId}/{$endpoint}";
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data, JSON_UNESCAPED_UNICODE));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->token
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        $response = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $result = json_decode((string)$response, true);
        if ($code >= 400) {
            $error = $result['error']['message'] ?? 'Unknown Meta API Error';
            throw new RuntimeException("Meta API Error: $error");
        }
        return $result ?? [];
    }

    public function sendText(string $to, string $text): array
    {
        $to = preg_replace('/\D+/', '', $to);
        return $this->post('messages', [
            'messaging_product' => 'whatsapp',
            'recipient_type' => 'individual',
            'to' => $to,
            'type' => 'text',
            'text' => [
                'preview_url' => false,
                'body' => $text
            ]
        ]);
    }
}
