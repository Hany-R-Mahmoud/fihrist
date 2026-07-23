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
import React from "react";
import "./landing.css";

const shelves = [
  { name: "Read next", count: "24 links", tone: "mint" },
  { name: "Field notes", count: "18 links", tone: "amber" },
  { name: "Reference", count: "42 links", tone: "paper" },
];

export default function Landing() {
  return (
    <div className="fihrist-landing">
      <header className="fihrist-landing-nav">
        <a className="fihrist-landing-brand" href="/" aria-label="Fihrist home">
          <span className="fihrist-landing-brand-mark" aria-hidden="true">
            <Bookmark size={18} strokeWidth={2.2} />
          </span>
          <span>Fihrist</span>
        </a>
        <nav className="fihrist-landing-links" aria-label="Landing page">
          <a href="#shelves">The shelves</a>
          <a href="#link-health">Link health</a>
        </nav>
        <a className="fihrist-landing-nav-cta" href="/library">
          Open bookmarks library <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </header>

      <main>
        <section className="fihrist-landing-hero" aria-labelledby="landing-title">
          <div className="fihrist-landing-hero-copy">
            <p className="fihrist-landing-kicker">
              <span className="fihrist-landing-kicker-dot" aria-hidden="true" />
              Your web, kept in good order
            </p>
            <h1 id="landing-title" aria-label="Keep the web you mean to return to.">
              <span>Keep the web</span>
              <span>you mean to</span>
              <span>return to.</span>
            </h1>
            <p className="fihrist-landing-intro">
              Fihrist turns a pile of tabs and half-remembered links into a living library —
              easy to browse, quietly organized, and honest about what still works.
            </p>
            <div className="fihrist-landing-actions">
              <a className="fihrist-landing-primary" href="/library">
                Open bookmarks library <ArrowUpRight size={18} aria-hidden="true" />
              </a>
              <a className="fihrist-landing-secondary" href="#shelves">
                See how it works <ArrowDownRight size={17} aria-hidden="true" />
              </a>
            </div>
            <p className="fihrist-landing-note">
              <Sparkles size={15} aria-hidden="true" />
              Local-first by default. No Manus sign-in at the door.
            </p>
          </div>

          <div className="fihrist-landing-stage" aria-label="A preview of a Fihrist bookmark library">
            <div className="fihrist-landing-stage-glow" aria-hidden="true" />
            <div className="fihrist-landing-orbit fihrist-landing-orbit--outer" aria-hidden="true">
              <span className="fihrist-landing-orbit-node fihrist-landing-orbit-node--one" />
              <span className="fihrist-landing-orbit-node fihrist-landing-orbit-node--two" />
              <span className="fihrist-landing-orbit-node fihrist-landing-orbit-node--three" />
            </div>
            <div className="fihrist-landing-orbit fihrist-landing-orbit--inner" aria-hidden="true">
              <span className="fihrist-landing-orbit-node fihrist-landing-orbit-node--four" />
            </div>
            <div className="fihrist-landing-link-lines" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>

            <article className="fihrist-landing-console">
              <div className="fihrist-landing-console-topline">
                <span className="fihrist-landing-console-eyebrow">Your library</span>
                <span className="fihrist-landing-console-status"><Check size={12} /> in sync</span>
              </div>
              <div className="fihrist-landing-console-heading">
                <div>
                  <span className="fihrist-landing-console-label">All bookmarks</span>
                  <strong>84</strong>
                </div>
                <div className="fihrist-landing-console-sparkline" aria-hidden="true">
                  <i /><i /><i /><i /><i /><i /><i />
                </div>
              </div>
              <div className="fihrist-landing-console-rule" />
              <div className="fihrist-landing-console-row">
                <span className="fihrist-landing-console-icon fihrist-landing-console-icon--mint"><Link2 size={14} /></span>
                <span><b>Designing with data</b><small>research / today</small></span>
                <span className="fihrist-landing-console-health">healthy</span>
              </div>
              <div className="fihrist-landing-console-row">
                <span className="fihrist-landing-console-icon fihrist-landing-console-icon--amber"><ScanSearch size={14} /></span>
                <span><b>Field guide to focus</b><small>read next / yesterday</small></span>
                <span className="fihrist-landing-console-health">healthy</span>
              </div>
              <div className="fihrist-landing-console-row">
                <span className="fihrist-landing-console-icon fihrist-landing-console-icon--coral"><CircleAlert size={14} /></span>
                <span><b>Old project notes</b><small>reference / 3 days ago</small></span>
                <span className="fihrist-landing-console-health fihrist-landing-console-health--warn">redirected</span>
              </div>
            </article>

            <div className="fihrist-landing-float-card fihrist-landing-float-card--one" aria-hidden="true">
              <span className="fihrist-landing-float-icon fihrist-landing-float-icon--mint"><Bookmark size={15} /></span>
              <span><b>Read next</b><small>24 links</small></span>
            </div>
            <div className="fihrist-landing-float-card fihrist-landing-float-card--two" aria-hidden="true">
              <span className="fihrist-landing-float-icon fihrist-landing-float-icon--amber"><ScanSearch size={15} /></span>
              <span><b>Link check</b><small>14 healthy</small></span>
            </div>
            <div className="fihrist-landing-float-card fihrist-landing-float-card--three" aria-hidden="true">
              <span className="fihrist-landing-float-icon fihrist-landing-float-icon--paper"><Sparkles size={15} /></span>
              <span><b>Sorted gently</b><small>no busywork</small></span>
            </div>
            <span className="fihrist-landing-stage-caption">A small system for a long memory.</span>
          </div>
        </section>

        <section className="fihrist-landing-shelves" id="shelves" aria-labelledby="shelves-title">
          <div className="fihrist-landing-section-heading">
            <p className="fihrist-landing-kicker">A library, not a landfill</p>
            <h2 id="shelves-title">Give every good link a place to land.</h2>
            <p>Save first. Sort when you have a minute. Find the thread again when it matters.</p>
          </div>
          <div className="fihrist-landing-shelf-grid">
            <article className="fihrist-landing-shelf-card fihrist-landing-shelf-card--large">
              <span className="fihrist-landing-card-number">01</span>
              <div>
                <h3>Capture without breaking your flow.</h3>
                <p>Drop in a URL, add a note, and keep moving. Fihrist holds the context until you are ready to return.</p>
              </div>
              <div className="fihrist-landing-card-line" aria-hidden="true"><span /><span /><span /></div>
            </article>
            <article className="fihrist-landing-shelf-card fihrist-landing-shelf-card--stack">
              <span className="fihrist-landing-card-number">02</span>
              <div>
                <h3>Let collections do the shelving.</h3>
                <p>Import your browser file and its folders become visible, useful collections.</p>
              </div>
              <div className="fihrist-landing-shelf-list" aria-label="Example bookmark collections">
                {shelves.map(shelf => (
                  <div className={`fihrist-landing-shelf-row fihrist-landing-shelf-row--${shelf.tone}`} key={shelf.name}>
                    <span className="fihrist-landing-shelf-mark" aria-hidden="true" />
                    <span>{shelf.name}</span>
                    <small>{shelf.count}</small>
                  </div>
                ))}
              </div>
            </article>
            <article className="fihrist-landing-shelf-card fihrist-landing-shelf-card--wide">
              <span className="fihrist-landing-card-number">03</span>
              <div>
                <h3>Make link health part of the ritual.</h3>
                <p>Check a whole shelf, see what moved, and clear confirmed dead ends together or one by one.</p>
              </div>
              <div className="fihrist-landing-health-strip" aria-hidden="true">
                <span><b>84</b><small>saved</small></span>
                <span><b>76</b><small>healthy</small></span>
                <span><b>08</b><small>to review</small></span>
              </div>
            </article>
          </div>
        </section>

        <section className="fihrist-landing-health" id="link-health" aria-labelledby="health-title">
          <div className="fihrist-landing-health-copy">
            <p className="fihrist-landing-kicker">A little maintenance, done beautifully</p>
            <h2 id="health-title" aria-label="The web changes. Your memory does not have to.">
              <span>The web changes.</span>{" "}
              <span>Your memory does</span>{" "}
              <span>not have to.</span>
            </h2>
            <p>Fihrist surfaces redirects and broken paths with enough context to act, without turning your library into an incident queue.</p>
            <a className="fihrist-landing-inline-link" href="/library">
              Browse your library <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
          <div className="fihrist-landing-ledger" aria-label="Example link health report">
            <div className="fihrist-landing-ledger-head"><span>Link health</span><span>Last checked just now</span></div>
            <div className="fihrist-landing-ledger-meter"><span /><span /><span /><span /><span /><span /><span /><span /></div>
            <div className="fihrist-landing-ledger-total"><strong>90%</strong><span>of your saved web is still within reach</span></div>
            <div className="fihrist-landing-ledger-row"><Check size={16} /><span>Healthy links</span><b>76</b></div>
            <div className="fihrist-landing-ledger-row fihrist-landing-ledger-row--warn"><CircleAlert size={16} /><span>Redirected links</span><b>05</b></div>
            <div className="fihrist-landing-ledger-row fihrist-landing-ledger-row--broken"><CircleAlert size={16} /><span>Broken links to review</span><b>03</b></div>
          </div>
        </section>

        <section id="open-library" className="fihrist-landing-final" aria-labelledby="final-title">
          <div>
            <p className="fihrist-landing-kicker">Start with the links you already love</p>
            <h2 id="final-title">Make room for better remembering.</h2>
          </div>
          <a className="fihrist-landing-primary" href="/library">
            Open bookmarks library <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        </section>
      </main>

      <footer className="fihrist-landing-footer">
        <span className="fihrist-landing-footer-brand"><Bookmark size={16} aria-hidden="true" /> Fihrist</span>
        <span>A quiet home for the web worth keeping.</span>
      </footer>
    </div>
  );
}
