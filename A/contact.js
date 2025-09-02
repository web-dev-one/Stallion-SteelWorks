
// Expose a debug helper for manual tests in DevTools (global on purpose)
globalThis.__pingContact = async function __pingContact() {
  console.log("[contact.js] __pingContact: sending test POST");
  try {
    const res = await fetch(CONTACT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Debug Tester",
        email: "test@example.com",
        phone: "000-000-0000",
        city: "Phoenix",
        service: "Mare Motel",
        message: "Debug ping from contact.js",
        page: location.href,
        userAgent: navigator.userAgent
      }),
      mode: "cors",
      credentials: "omit"
    });
    const text = await res.text().catch(() => "");
    console.log("[contact.js] __pingContact result", res.status, text);
  } catch (e) {
    console.error("[contact.js] __pingContact network error", e);
  }
};

// Wrap everything else to avoid polluting the global scope
(() => {
  console.log("[contact.js] loaded", { CONTACT_API_URL });

  // Utilities (scoped; not globals)
  const $ = (id) => document.getElementById(id);
  const reveal = (el) => { if (el) el.style.display = "block"; };
  const conceal = (el) => { if (el) el.style.display = "none"; };

  window.addEventListener("DOMContentLoaded", () => {
    const form = $("contactForm");
    const alertOk = $("alert-ok");
    const alertErr = $("alert-err");
    const submitBtn = $("submitBtn");

    if (!form) {
      console.error("[contact.js] contactForm element not found");
      return;
    }
    console.log("[contact.js] attaching submit handler");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      conceal(alertOk); conceal(alertErr);

      // Honeypot
      if (form.website && form.website.value) {
        reveal(alertOk); form.reset(); return;
      }

      // Collect & validate
      const payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        city: form.city.value.trim(),
        service: form.service.value,
        message: form.message.value.trim(),
        page: window.location.href,
        userAgent: navigator.userAgent
      };
      if (!payload.name || !payload.email || !payload.service || !payload.message) {
        console.warn("[contact.js] validation failed", payload);
        reveal(alertErr); return;
      }

      // Disable UI while sending
      submitBtn.disabled = true;
      const prev = submitBtn.textContent;
      submitBtn.textContent = "Sending…";

      try {
        console.log("[contact.js] POST", CONTACT_API_URL, payload);
        const res = await fetch(CONTACT_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          mode: "cors",
          credentials: "omit"
        });

        const text = await res.text().catch(() => "");
        if (!res.ok) {
          console.error("[contact.js] API error", res.status, text);
          reveal(alertErr);
        } else {
          console.log("[contact.js] API success", res.status, text || "(no body)");
          form.reset();
          reveal(alertOk);
        }
      } catch (err) {
        console.error("[contact.js] network error", err);
        reveal(alertErr);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = prev;
      }
    });
  });
})();
