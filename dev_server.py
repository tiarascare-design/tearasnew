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
        # Security headers: content security policy (development-safe), MIME sniffing, framing and referrer policies
        # Note: this CSP keeps 'unsafe-inline' for scripts to avoid breaking existing inline event-attributes
        # in the client templates. It does remove 'unsafe-eval' which improves security without affecting runtime.
        csp = (
            "default-src 'self' https: data:; "
            "script-src 'self' 'unsafe-inline' https:; "
            "style-src 'self' 'unsafe-inline' https:; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https: ws:; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
        self.send_header("Content-Security-Policy", csp)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        # Minimal permissions policy - disable sensitive features by default
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        # Do NOT set COEP here to avoid inadvertent cross-origin isolation issues
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
