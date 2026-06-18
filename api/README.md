# API PIX (`pix_api.php`)

Endpoint PHP para saques via Efi Pay. Requer **PHP 8+** com extensão **curl** e **openssl**.

## Arquivos necessários na raiz do site

```
projeto/
  api/pix_api.php          ← este arquivo
  config.pix.local.php     ← credenciais (nao commitar)
  certs/efipay-producao.p12
```

## Local

1. `iniciar_servidor.bat` — sobe PHP em http://localhost:8080  
2. `testar_pix.bat` — testa OAuth com a Efi  

Health: `GET /api/pix_api.php?action=health` + header `X-PIX-Token`

## Produção (Hostinger)

Envie `api/`, `config.pix.local.php` e `certs/*.p12` para a mesma pasta do `index.html`.
