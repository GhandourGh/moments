import React from "react";
import { APP, CONTACT } from '@/config/couple.js';
import { openExternal } from '@/lib/openExternal.js';

/**
 * Site-wide footer — brief app description and host contact links.
 */
export default function AppFooter() {
  function openWhatsApp(e) {
    e.preventDefault();
    openExternal({
      native: CONTACT.whatsappNative,
      web: CONTACT.whatsappWeb,
    });
  }

  function openInstagram(e) {
    e.preventDefault();
    openExternal({
      native: CONTACT.instagramNative,
      web: CONTACT.instagramWeb,
    });
  }

  return (
    <footer className="app-footer section-band section-band--alt">
      <div className="app-footer-inner section-inner">
        <p className="app-footer-kicker">About this app</p>
        <h2 className="app-footer-title display-title">{APP.name}</h2>
        <p className="app-footer-about">{APP.about}</p>
        <p className="app-footer-host">
          Built by {APP.host}. Questions or need help?
        </p>

        <div className="app-footer-social" aria-label="Contact the app host">
          <a
            className="app-footer-icon"
            href={CONTACT.whatsappWeb}
            onClick={openWhatsApp}
            aria-label="Message on WhatsApp"
          >
            <WhatsAppIcon />
          </a>
          <a
            className="app-footer-icon"
            href={CONTACT.instagramWeb}
            onClick={openInstagram}
            aria-label="Follow on Instagram"
          >
            <InstagramIcon />
          </a>
        </div>

        <p className="app-footer-fallback">
          Or reach us at{" "}
          <a className="app-footer-link" href={`tel:+${CONTACT.whatsapp}`}>
            +{CONTACT.whatsapp.replace(/^961/, "961 ")}
          </a>
          {" · "}
          <a
            className="app-footer-link"
            href={CONTACT.instagramWeb}
            onClick={openInstagram}
          >
            @{CONTACT.instagramUsername}
          </a>
        </p>
      </div>
    </footer>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
