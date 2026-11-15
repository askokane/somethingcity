$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $PSScriptRoot).Path.TrimEnd('\')
$rootPrefix = $rootPath + '\'
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 8000)
$listener.Start()
Write-Host "BreachLink preview: http://127.0.0.1:8000/  (Ctrl+C to stop)"

while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
        $stream = $client.GetStream()
        $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
        $requestLine = $reader.ReadLine()
        while ($null -ne ($header = $reader.ReadLine()) -and $header.Length -gt 0) { }

        $parts = $requestLine -split ' '
        $requestedPath = if ($parts.Count -gt 1) { ($parts[1] -split '\?')[0] } else { '/' }
        $relativePath = [Uri]::UnescapeDataString($requestedPath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }
        $filePath = [System.IO.Path]::GetFullPath((Join-Path $rootPath $relativePath))
        $isInsideWorkspace = $filePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)

        if ($isInsideWorkspace -and (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
            $mime = switch ($extension) {
                '.html' { 'text/html; charset=utf-8' }
                '.css' { 'text/css; charset=utf-8' }
                '.js' { 'text/javascript; charset=utf-8' }
                '.glb' { 'model/gltf-binary' }
                '.png' { 'image/png' }
                default { 'application/octet-stream' }
            }
            $body = [System.IO.File]::ReadAllBytes($filePath)
            $status = '200 OK'
        } else {
            $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
            $mime = 'text/plain; charset=utf-8'
            $status = '404 Not Found'
        }

        $headerText = "HTTP/1.1 $status`r`nContent-Type: $mime`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerText)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($body, 0, $body.Length)
        $stream.Flush()
    } catch {
        Write-Warning $_
    } finally {
        $client.Dispose()
    }
}
