import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { CSS } from "../styles/tokens";

interface LoginProps {
  error?: boolean;
  csrfToken: string;
}

const THEME_INIT = raw(`<script>
(function(){
  var t = localStorage.getItem('buddy-theme');
  if (!t) t = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.colorScheme = t;
})();
</script>`);

export const LoginPage: FC<LoginProps> = ({ error, csrfToken }) => {
  return (
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Login — buddy</title>
        {/* System fonts — no external font loading */}
        {raw(`<style>${CSS}</style>`)}
        {THEME_INIT}
      </head>
      <body>
        <div class="login-page">
          <div class="login-box">
            <h1>buddy</h1>
            {error && <p class="error">Ungültiger Token</p>}
            <form method="post" action="/login">
              <input type="hidden" name="csrf" value={csrfToken} />
              <input
                name="token"
                type="password"
                placeholder="Token eingeben..."
                autofocus
                autocomplete="current-password"
              />
              <button type="submit">Anmelden</button>
            </form>
          </div>
        </div>
      </body>
    </html>
  );
};
