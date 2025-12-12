# Script para gerar chave de criptografia segura
# Execute: .\generate-encryption-key.ps1

Write-Host "🔐 Gerando chave de criptografia..." -ForegroundColor Cyan
Write-Host ""

# Gera 32 bytes aleatórios e converte para Base64
$key = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))

Write-Host "Chave gerada:" -ForegroundColor Green
Write-Host $key -ForegroundColor Yellow
Write-Host ""
Write-Host "📋 Copie esta chave e adicione nos arquivos:" -ForegroundColor Cyan
Write-Host "   Backend:  .env (ENCRYPTION_MASTER_KEY)" -ForegroundColor White
Write-Host "   Frontend: .env.local (REACT_APP_ENCRYPTION_MASTER_KEY)" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  IMPORTANTE: Use a MESMA chave em ambos os arquivos!" -ForegroundColor Red

