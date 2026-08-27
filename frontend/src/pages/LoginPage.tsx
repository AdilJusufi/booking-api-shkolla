import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, Eye, EyeOff, Lock, Mail, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ApiError } from "../lib/api";
import {
  classifyLoginError,
  getErrorMessage,
  getLoginDeactivatedMessage,
  getLoginInvalidCredentialsMessage,
  getLoginLockedMessage,
  getLoginUnconfirmedEmailMessage,
} from "../lib/errors";
import { useCooldown } from "../lib/useCooldown";
import { ErrorBox } from "../components/ui";
import { ROLE_HOME } from "../components/ProtectedRoute";
import Logo from "../components/Logo";

export default function LoginPage() {
  const { t: tCommon } = useTranslation("common");
  const { t } = useTranslation("auth");
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { secondsLeft, startCooldown } = useCooldown();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const authUser = await login(email, password);
      // Honor an explicit redirect (e.g. bounced here from a protected page)
      // over the role default, but only if it's not the generic patient home
      // some other role would otherwise be wrongly sent to.
      const ownRole = authUser.roles.find((r) => ROLE_HOME[r]);
      const destination = from ?? (ownRole && ROLE_HOME[ownRole]) ?? "/";
      navigate(destination, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // Deliberately form-level, never on a field: the API doesn't say
        // which of email/password was wrong, and guessing would tell an
        // attacker which emails have accounts. account_deactivated (403) is
        // the one case where the credentials ARE correct, so it's fine to be
        // specific about that one.
        const kind = classifyLoginError(err);
        if (kind === "other") {
          setError(getErrorMessage(err, { default: t("login.genericFailure") }));
          return;
        }
        setError(
          kind === "locked"
            ? getLoginLockedMessage()
            : kind === "unconfirmed"
              ? getLoginUnconfirmedEmailMessage()
              : kind === "deactivated"
                ? getLoginDeactivatedMessage()
                : getLoginInvalidCredentialsMessage(),
        );
        return;
      }
      if (err instanceof ApiError && err.status === 429) {
        startCooldown();
      }
      setError(getErrorMessage(err, { default: t("login.genericFailure") }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="split-auth">
      <div className="split-auth__brand">
        <span className="split-auth__brand-mark">
          <Logo variant="stacked" tone="inverted" size={56} />
        </span>
        <h1>{t("brand.tagline")}</h1>
        <div className="split-auth__brand-trust">
          <span className="split-auth__trust-item">
            <CheckCircle size={16} strokeWidth={1.5} /> {t("brand.trustDoctors")}
          </span>
          <span className="split-auth__trust-item">
            <CheckCircle size={16} strokeWidth={1.5} /> {t("brand.trustClinics")}
          </span>
          <span className="split-auth__trust-item">
            <CheckCircle size={16} strokeWidth={1.5} /> {t("brand.trustBooking")}
          </span>
        </div>
      </div>

      <div className="split-auth__mobile-bar">
        <Link to="/" className="brand">
          <Logo variant="horizontal" tone="inverted" size={24} />
        </Link>
      </div>

      <div className="split-auth__form">
        <div className="split-auth__form-inner">
          <div className="split-auth__top">
            <button
              type="button"
              className="theme-toggle"
              aria-label={
                theme === "dark"
                  ? tCommon("theme.switchToLight")
                  : tCommon("theme.switchToDark")
              }
              onClick={toggleTheme}
            >
              {theme === "dark" ? (
                <Sun size={18} strokeWidth={1.5} />
              ) : (
                <Moon size={18} strokeWidth={1.5} />
              )}
            </button>
            <Link to="/regjistrohu">{tCommon("nav.register")}</Link>
            <span>{t("login.noAccount")}</span>
          </div>
          <h1>{t("login.title")}</h1>
          <p className="auth-sub">{t("login.subtitle")}</p>

          <form onSubmit={handleSubmit} className="form">
            {error && <ErrorBox message={error} />}
            <div className="field field--icon">
              <label>{t("fields.email.label")}</label>
              <span className="field__icon" aria-hidden>
                <Mail size={16} strokeWidth={1.5} />
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("fields.email.placeholder")}
              />
            </div>
            <div className="field field--icon">
              <label>{t("fields.password.label")}</label>
              <span className="field__icon" aria-hidden>
                <Lock size={16} strokeWidth={1.5} />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("fields.password.placeholder")}
              />
              <button
                type="button"
                className="field__toggle"
                aria-label={
                  showPassword ? t("passwordToggle.hide") : t("passwordToggle.show")
                }
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <EyeOff size={16} strokeWidth={1.5} />
                ) : (
                  <Eye size={16} strokeWidth={1.5} />
                )}
              </button>
            </div>

            <label className="field-check">
              <input type="checkbox" /> {t("login.rememberMe")}
            </label>

            <button
              className="btn btn--primary btn--lg btn--block"
              disabled={loading || secondsLeft > 0}
            >
              {loading
                ? t("login.submitting")
                : secondsLeft > 0
                  ? t("common.retryCountdown", { seconds: secondsLeft })
                  : t("login.submit")}
            </button>
          </form>

          <p className="auth-alt" style={{ marginTop: 16 }}>
            <Link to="/harrova-fjalekalimin">{t("login.forgotPasswordLink")}</Link>
          </p>
          <p className="auth-alt" style={{ marginTop: 4 }}>
            <Link to="/konfirmo-email/ridergo">{t("login.resendConfirmationLink")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
