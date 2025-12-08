from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
import sys

class HeaderHandler(SimpleHTTPRequestHandler):
    # Make responses clearly identifiable as our custom handler
    server_version = "COOPServer/1.0"
    """Static server that adds COOP header to allow cross-origin popups.

    This prevents Chromium errors like:
    "Cross-Origin-Opener-Policy policy would block the window.closed call."
    by relaxing COOP to keep the opener relationship for OAuth/payment popups.
    """
    def end_headers(self) -> None:
        # Keep the popup<->opener relationship for cross-origin auth/payment windows
        self.send_header("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
        # Extra diagnostic header to confirm we're serving from the custom handler
        self.send_header("X-Dev-Server", "coop")
        # Add common security headers to improve local dev parity with production
        # NOTE: CSP is kept conservative by default (no 'unsafe-inline' for scripts).
        # To allow legacy inline handlers during development set the environment
        # variable DEV_ALLOW_UNSAFE_INLINE=1 before starting the server.
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer-when-downgrade")
        self.send_header("Permissions-Policy", "geolocation=(), microphone=()")
        # X-XSS-Protection is deprecated in modern browsers but harmless for local dev
        self.send_header("X-XSS-Protection", "1; mode=block")

        # Build a Content-Security-Policy header. By default we do NOT allow
        # 'unsafe-inline' for scripts. If the project still uses inline event
        # handlers (onclick=...) or inline script blocks you can enable the
        # compatibility mode by exporting DEV_ALLOW_UNSAFE_INLINE=1.
        allow_unsafe = os.environ.get("DEV_ALLOW_UNSAFE_INLINE", "0").lower() in ("1", "true", "yes")
        script_src = ["'self'", "https://www.gstatic.com", "https://www.googleapis.com", "https://cdn.jsdelivr.net", "https://cdn.jsdelivr.net/npm", "https://cdn.jsdelivr.net/npm/"]
        if allow_unsafe:
            script_src.append("'unsafe-inline'")

        # Minimal CSP for development: adjusts as needed for external services
        csp = (
            "default-src 'self' data: https:; "
            f"script-src {' '.join(script_src)}; "
            "connect-src 'self' https://*.googleapis.com https://*.gstatic.com wss:; "
            "img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com data:;"
        )
        self.send_header("Content-Security-Policy", csp)

        # Continue with default header finalization
        super().end_headers()


def run(port: int = 5500, directory: str | None = None) -> None:
    if directory:
        os.chdir(directory)
    httpd = ThreadingHTTPServer(("", port), HeaderHandler)
    try:
        print(f"Serving {os.getcwd()} on http://localhost:{port} with COOP=same-origin-allow-popups")
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    directory = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
    run(port, directory)
