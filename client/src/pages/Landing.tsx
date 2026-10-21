import {
  ArrowDownRight,
  ArrowUpRight,
  Bookmark,
  Check,
  CircleAlert,
  Link2,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { HealthStamp } from "@/components/HealthStamp";
import { useLocale } from "@/i18n/LocaleContext";
import { formatDate } from "@/i18n/format";
import { enterGuestMode, leaveGuestMode } from "@/lib/guestLibrary";
import { useCloudSession } from "@/lib/neonAuth";
import "./landing.css";

const shelves = [
  {
    nameKey: "landing.float.readNext",
    countKey: "landing.shelves.readNextCount",
  },
  {
    nameKey: "landing.shelves.fieldNotes",
    countKey: "landing.shelves.fieldNotesCount",
  },
  {
    nameKey: "landing.shelves.reference",
    countKey: "landing.shelves.referenceCount",
  },
] as const;

export default function Landing() {
  const { t, locale } = useLocale();
  const session = useCloudSession();
  const signedIn = Boolean(session.data?.user);
  const destination = signedIn ? "/library" : "/sign-in";
  // The stamp lands once, when the health section first comes into view.
  const healthRef = useRef<HTMLElement | null>(null);
  const [stamped, setStamped] = useState(false);
  useEffect(() => {
    const node = healthRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setStamped(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setStamped(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // The hero art is pre-composited per language: the wooden sign carries real
  // Arabic in the Arabic edition and a Latin one in the English edition. It is
  // never CSS-flipped, only the text column swaps side.
  const heroArt =
    locale === "ar" ? "/kiosk/hero-kiosk-ar.webp" : "/kiosk/hero-kiosk-en.webp";

  return (
    <div className="fihrist-landing">
      <header className="fihrist-landing-masthead">
        <div className="fihrist-landing-masthead-row">
          <a
            className="fihrist-landing-brand"
            href="/"
            aria-label={t("landing.homeLink")}
          >
            <span className="fihrist-landing-brand-mark" aria-hidden="true">
              <Bookmark size={18} strokeWidth={2.2} />
            </span>
            <span className="fihrist-landing-brand-name">{t("app.name")}</span>
          </a>
          <nav
            className="fihrist-landing-links"
            aria-label={t("landing.navLabel")}
          >
            <a href="#shelves">{t("landing.nav.shelves")}</a>
            <a href="#link-health">{t("landing.nav.health")}</a>
          </nav>
          <a
            className="fihrist-landing-nav-cta"
            href={destination}
            onClick={leaveGuestMode}
          >
            {signedIn ? t("auth.openLibrary") : t("auth.signIn")}{" "}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
        <p className="fihrist-landing-dateline">
          <span className="fihrist-landing-dateline-label">
            {t("landing.dateline")}
          </span>
          <span className="fihrist-landing-dateline-rule" aria-hidden="true" />
          <time dateTime={new Date().toISOString().slice(0, 10)}>
            {formatDate(new Date(), locale)}
          </time>
        </p>
      </header>

      <main>
        <section
          className="fihrist-landing-hero"
          aria-labelledby="landing-title"
        >
          <div className="fihrist-landing-hero-copy">
            <p className="fihrist-landing-kicker">
              <span className="fihrist-landing-kicker-dot" aria-hidden="true" />
              {t("landing.kicker")}
            </p>
            <h1 id="landing-title" aria-label={t("landing.heroAria")}>
              <span>{t("landing.heroLine1")}</span>
              <span>{t("landing.heroLine2")}</span>
              <span className="fihrist-landing-hero-line-accent">
                {t("landing.heroLine3")}
              </span>
            </h1>
            <p className="fihrist-landing-category">
              {t("landing.categoryLine")}
            </p>
            <p className="fihrist-landing-intro">{t("landing.intro")}</p>
            <div className="fihrist-landing-actions">
              <a
                className="fihrist-landing-primary"
                href={destination}
                onClick={leaveGuestMode}
              >
                {signedIn ? t("auth.openLibrary") : t("auth.google")}{" "}
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
              <button
                type="button"
                className="fihrist-landing-secondary"
                onClick={enterGuestMode}
              >
                {t("auth.guest")} <Bookmark size={17} aria-hidden="true" />
              </button>
              <a className="fihrist-landing-secondary" href="#shelves">
                {t("landing.seeHow")}{" "}
                <ArrowDownRight size={17} aria-hidden="true" />
              </a>
            </div>
            <p className="fihrist-landing-note">
              <Sparkles size={15} aria-hidden="true" />
              {signedIn ? t("auth.signedInNote") : t("auth.guestNote")}
            </p>
          </div>

          <div
            className="fihrist-landing-stage"
            aria-label={t("landing.stageAria")}
          >
            <img
              className="fihrist-landing-hero-art"
              src={heroArt}
              alt=""
              width={2048}
              height={1152}
              fetchPriority="high"
              decoding="async"
            />

            <article className="fihrist-landing-console">
              <div className="fihrist-landing-console-topline">
                <span className="fihrist-landing-console-eyebrow">
                  {t("landing.console.yourLibrary")}
                </span>
                <span className="fihrist-landing-console-status">
                  <Check size={12} aria-hidden="true" />{" "}
                  {t("landing.console.inSync")}
                </span>
              </div>
              <div className="fihrist-landing-console-heading">
                <div>
                  <span className="fihrist-landing-console-label">
                    {t("landing.console.allBookmarks")}
                  </span>
                  <strong>84</strong>
                </div>
                <div
                  className="fihrist-landing-console-sparkline"
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="fihrist-landing-console-rule" />
              <div className="fihrist-landing-console-row">
                <span className="fihrist-landing-console-icon fihrist-landing-console-icon--green">
                  <Link2 size={14} aria-hidden="true" />
                </span>
                <span>
                  <b>{t("landing.console.row1")}</b>
                  <small>{t("landing.console.row1Meta")}</small>
                </span>
                <span className="fihrist-landing-console-health">
                  {t("landing.console.healthy")}
                </span>
              </div>
              <div className="fihrist-landing-console-row">
                <span className="fihrist-landing-console-icon fihrist-landing-console-icon--mustard">
                  <ScanSearch size={14} aria-hidden="true" />
                </span>
                <span>
                  <b>{t("landing.console.row2")}</b>
                  <small>{t("landing.console.row2Meta")}</small>
                </span>
                <span className="fihrist-landing-console-health">
                  {t("landing.console.healthy")}
                </span>
              </div>
              <div className="fihrist-landing-console-row">
                <span className="fihrist-landing-console-icon fihrist-landing-console-icon--brick">
                  <CircleAlert size={14} aria-hidden="true" />
                </span>
                <span>
                  <b>{t("landing.console.row3")}</b>
                  <small>{t("landing.console.row3Meta")}</small>
                </span>
                <span className="fihrist-landing-console-health fihrist-landing-console-health--warn">
                  {t("landing.console.redirected")}
                </span>
              </div>
            </article>
          </div>
        </section>

        <div className="fihrist-landing-strip" aria-hidden="true">
          <img
            src="/kiosk/shelf-strip.webp"
            alt=""
            width={2200}
            height={943}
            loading="lazy"
            decoding="async"
          />
        </div>

        <section
          className="fihrist-landing-health"
          id="link-health"
          ref={healthRef}
          aria-labelledby="health-title"
        >
          <div className="fihrist-landing-health-copy">
            <p className="fihrist-landing-kicker">
              {t("landing.health.kicker")}
            </p>
            <h2 id="health-title" aria-label={t("landing.health.titleAria")}>
              <span>{t("landing.health.line1")}</span>{" "}
              <span>{t("landing.health.line2")}</span>{" "}
              <span>{t("landing.health.line3")}</span>
            </h2>
            <p>{t("landing.health.body")}</p>
            <a
              className="fihrist-landing-inline-link"
              href={destination}
              onClick={leaveGuestMode}
            >
              {t("landing.health.browse")}{" "}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
          <div
            className="fihrist-landing-ledger"
            aria-label={t("landing.ledger.title")}
          >
            <HealthStamp
              variant="checked"
              className={`fihrist-landing-stamp ${stamped ? "is-stamped" : ""}`}
            />
            <div className="fihrist-landing-ledger-head">
              <span>{t("landing.ledger.title")}</span>
              <span>{t("landing.ledger.checked")}</span>
            </div>
            <div className="fihrist-landing-ledger-meter">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="fihrist-landing-ledger-total">
              <strong>90%</strong>
              <span>{t("landing.ledger.total")}</span>
            </div>
            <div className="fihrist-landing-ledger-row">
              <Check size={16} aria-hidden="true" />
              <span>{t("landing.ledger.healthy")}</span>
              <b>76</b>
            </div>
            <div className="fihrist-landing-ledger-row fihrist-landing-ledger-row--warn">
              <CircleAlert size={16} aria-hidden="true" />
              <span>{t("landing.ledger.redirected")}</span>
              <b>05</b>
            </div>
            <div className="fihrist-landing-ledger-row fihrist-landing-ledger-row--broken">
              <CircleAlert size={16} aria-hidden="true" />
              <span>{t("landing.ledger.broken")}</span>
              <b>03</b>
            </div>
          </div>
        </section>

        <section
          className="fihrist-landing-shelves"
          id="shelves"
          aria-labelledby="shelves-title"
        >
          <div className="fihrist-landing-section-heading">
            <p className="fihrist-landing-kicker">
              {t("landing.shelves.kicker")}
            </p>
            <h2 id="shelves-title">{t("landing.shelves.title")}</h2>
            <p>{t("landing.shelves.body")}</p>
          </div>
          <div className="fihrist-landing-shelf-grid">
            <article className="fihrist-landing-shelf-card fihrist-landing-shelf-card--large">
              <span className="fihrist-landing-card-number">01</span>
              <div className="fihrist-landing-card-copy">
                <h3>{t("landing.card1.title")}</h3>
                <p>{t("landing.card1.body")}</p>
              </div>
              <img
                className="fihrist-landing-card-art"
                src="/kiosk/spot-ai-tags.webp"
                alt=""
                width={1200}
                height={1200}
                loading="lazy"
                decoding="async"
              />
            </article>
            <article className="fihrist-landing-shelf-card fihrist-landing-shelf-card--stack">
              <span className="fihrist-landing-card-number">02</span>
              <div className="fihrist-landing-card-copy">
                <h3>{t("landing.card2.title")}</h3>
                <p>{t("landing.card2.body")}</p>
              </div>
              <img
                className="fihrist-landing-card-art"
                src="/kiosk/spot-collections.webp"
                alt=""
                width={1200}
                height={1200}
                loading="lazy"
                decoding="async"
              />
              <div
                className="fihrist-landing-shelf-list"
                aria-label={t("landing.card2.aria")}
              >
                {shelves.map((shelf, index) => (
                  <div
                    className={`fihrist-landing-shelf-row fihrist-landing-shelf-row--${index === 0 ? "green" : index === 1 ? "mustard" : "brick"}`}
                    key={shelf.nameKey}
                  >
                    <span
                      className="fihrist-landing-shelf-mark"
                      aria-hidden="true"
                    />
                    <span>{t(shelf.nameKey)}</span>
                    <small>{t(shelf.countKey)}</small>
                  </div>
                ))}
              </div>
            </article>
            <article className="fihrist-landing-shelf-card fihrist-landing-shelf-card--wide">
              <span className="fihrist-landing-card-number">03</span>
              <div className="fihrist-landing-card-copy">
                <h3>{t("landing.card3.title")}</h3>
                <p>{t("landing.card3.body")}</p>
              </div>
              <img
                className="fihrist-landing-card-art"
                src="/kiosk/spot-health.webp"
                alt=""
                width={1200}
                height={1200}
                loading="lazy"
                decoding="async"
              />
              <div className="fihrist-landing-health-strip" aria-hidden="true">
                <span>
                  <b>84</b>
                  <small>{t("landing.card3.saved")}</small>
                </span>
                <span>
                  <b>76</b>
                  <small>{t("landing.card3.healthy")}</small>
                </span>
                <span>
                  <b>08</b>
                  <small>{t("landing.card3.toReview")}</small>
                </span>
              </div>
            </article>
          </div>
        </section>

        <section
          id="open-library"
          className="fihrist-landing-final"
          aria-labelledby="final-title"
        >
          <div>
            <p className="fihrist-landing-kicker">
              {t("landing.final.kicker")}
            </p>
            <h2 id="final-title">{t("landing.final.title")}</h2>
          </div>
          <div className="fihrist-landing-actions">
            <a
              className="fihrist-landing-primary"
              href={destination}
              onClick={leaveGuestMode}
            >
              {signedIn ? t("auth.openLibrary") : t("auth.signIn")}{" "}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
            <button
              type="button"
              className="fihrist-landing-secondary"
              onClick={enterGuestMode}
            >
              {t("auth.guest")} <Bookmark size={17} aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      <footer className="fihrist-landing-footer">
        <span className="fihrist-landing-footer-brand">
          <Bookmark size={16} aria-hidden="true" /> {t("app.name")}
        </span>
        <span>{t("landing.footer")}</span>
      </footer>
    </div>
  );
}
