import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Painel',
  description: 'Painel de controle do servidor.',
  keywords: 'servidor, dashboard, docker, ollama',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                if (typeof globalThis === 'undefined') {
                  window.globalThis = window;
                }
                if (typeof window === 'undefined') return;
                if (!window.queueMicrotask) {
                  window.queueMicrotask = function(cb) {
                    Promise.resolve().then(cb);
                  };
                }
                if (!Object.hasOwn) {
                  Object.hasOwn = function(obj, prop) {
                    return Object.prototype.hasOwnProperty.call(obj, prop);
                  };
                }
                if (!Array.prototype.at) {
                  Array.prototype.at = function(n) {
                    n = Math.trunc(n) || 0;
                    if (n < 0) n += this.length;
                    if (n < 0 || n >= this.length) return undefined;
                    return this[n];
                  };
                }
                if (!String.prototype.at) {
                  String.prototype.at = function(n) {
                    n = Math.trunc(n) || 0;
                    if (n < 0) n += this.length;
                    if (n < 0 || n >= this.length) return undefined;
                    return this.charAt(n);
                  };
                }
                if (!String.prototype.replaceAll) {
                  String.prototype.replaceAll = function(str, newStr) {
                    if (Object.prototype.toString.call(str).toLowerCase() === '[object regexp]') {
                      return this.replace(str, newStr);
                    }
                    return this.split(str).join(newStr);
                  };
                }
                // Unwrap @layer for LG WebOS TVs (Chromium < 99) where @layer rules are ignored
                function fixTvStyles() {
                  try {
                    if (window.CSS && CSS.supports && CSS.supports('selector(:is(a))') && CSS.supports('top', '0px')) {
                      // Even if CSS.supports exists, check if @layer is unsupported
                    }
                    var sheets = document.querySelectorAll('link[rel="stylesheet"]');
                    sheets.forEach(function(link) {
                      if (link.dataset.tvFixed || !link.href || link.href.indexOf('/_next/static/') === -1) return;
                      link.dataset.tvFixed = '1';
                      fetch(link.href).then(function(r){ return r.text(); }).then(function(css){
                        var flat = css
                          .replace(/@layer\\s+[a-zA-Z0-9_.,\\s-]+;/g, '')
                          .replace(/@layer\\s+[a-zA-Z0-9_-]+\\s*\\{/g, '@media all {')
                          .replace(/@supports\\s*\\(\\(\\(-webkit-hyphens:none\\)\\)[^\\{]+\\{/g, '@media all {')
                          .replace(/--tw-leading:initial;/g, '')
                          .replace(/--tw-font-weight:initial;/g, '')
                          .replace(/--tw-tracking:initial;/g, '')
                          .replace(/padding-inline:([^;\\}]+)/g, 'padding-left:$1;padding-right:$1')
                          .replace(/padding-block:([^;\\}]+)/g, 'padding-top:$1;padding-bottom:$1')
                          .replace(/margin-inline:([^;\\}]+)/g, 'margin-left:$1;margin-right:$1')
                          .replace(/margin-block:([^;\\}]+)/g, 'margin-top:$1;margin-bottom:$1')
                          .replace(/([\\{;])inset:0(px)?([;\\}])/g, '$1top:0;right:0;bottom:0;left:0$3')
                          .replace(/100dvh/g, '100vh');
                        var s = document.createElement('style');
                        s.textContent = flat;
                        document.head.appendChild(s);
                      }).catch(function(){});
                    });
                  } catch(e) {}
                }
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', fixTvStyles);
                } else {
                  fixTvStyles();
                }
                setTimeout(fixTvStyles, 800);
              })();
            `,
          }}
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className={inter.className}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
