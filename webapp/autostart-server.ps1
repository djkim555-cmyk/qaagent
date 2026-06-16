# QA Agent Team webapp autostart launcher (pure ASCII on purpose:
# Windows PowerShell 5.1 misreads non-ASCII in BOM-less files, so we keep
# zero non-ASCII here and derive the webapp dir from the script's own location).
#
# Task Scheduler runs this hidden at logon.
#  - If port 5510 is already up (e.g. started manually), do not start a 2nd copy.
#  - If the server dies, restart it after 10s (crash-recovery loop).
#  - stdout/stderr are appended to out.log / err.log.
$ErrorActionPreference = 'SilentlyContinue'
$webapp = $PSScriptRoot
Set-Location -LiteralPath $webapp

while ($true) {
    $listening = Get-NetTCPConnection -State Listen -LocalPort 5510 -ErrorAction SilentlyContinue
    if (-not $listening) {
        ("[{0}] server start" -f (Get-Date)) | Out-File -FilePath 'out.log' -Append -Encoding utf8
        # Run npm start via cmd so we can append both streams to log files.
        # Blocks until the server process exits.
        & cmd /c "npm start >> out.log 2>> err.log"
        ("[{0}] server exited - restart pending" -f (Get-Date)) | Out-File -FilePath 'err.log' -Append -Encoding utf8
    }
    Start-Sleep -Seconds 10
}
