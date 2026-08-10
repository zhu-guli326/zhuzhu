(function () {
  const MAX_EVENT_PARAMS = 25;
  const MAX_PARAM_VALUE_LENGTH = 100;

  function normalizeName(value, fallback) {
    const normalized = String(value || fallback || "event")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    return /^[a-z]/.test(normalized) ? normalized : `${fallback || "event"}_${normalized || "custom"}`;
  }

  function normalizePayload(data) {
    return Object.entries(data || {})
      .slice(0, MAX_EVENT_PARAMS)
      .reduce((payload, [key, value]) => {
        if (value == null) return payload;
        const name = normalizeName(key, "param");
        if (typeof value === "string") payload[name] = value.slice(0, MAX_PARAM_VALUE_LENGTH);
        else if (typeof value === "number" || typeof value === "boolean") payload[name] = value;
        else payload[name] = JSON.stringify(value).slice(0, MAX_PARAM_VALUE_LENGTH);
        return payload;
      }, {});
  }

  function trackSiteEvent(name, data) {
    const eventName = String(name || "Custom Event");
    const payload = normalizePayload(data);

    try {
      window.va?.("event", { name: eventName, data: payload });
    } catch (error) {
      console.warn("Vercel Analytics event skipped", error);
    }

    try {
      window.gtag?.("event", normalizeName(eventName, "event"), payload);
    } catch (error) {
      console.warn("Google Analytics event skipped", error);
    }
  }

  function describeLink(link) {
    const label =
      link.getAttribute("aria-label") ||
      link.textContent.replace(/\s+/g, " ").trim() ||
      link.getAttribute("href") ||
      "link";
    return label.slice(0, MAX_PARAM_VALUE_LENGTH);
  }

  function describeSection(node) {
    const section = node.closest("section, footer, header, nav");
    return section?.id || section?.className || "";
  }

  window.trackSiteEvent = trackSiteEvent;
  window.trackAnalyticsEvent = trackSiteEvent;

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link) {
      const href = link.getAttribute("href") || "";
      const payload = {
        label: describeLink(link),
        href,
        section: describeSection(link),
      };
      if (href.startsWith("mailto:")) trackSiteEvent("Email Clicked", payload);
      else if (href.startsWith("tel:")) trackSiteEvent("Phone Clicked", payload);
      else if (href.startsWith("http")) trackSiteEvent("Outbound Link Clicked", payload);
      else if (href.startsWith("#")) trackSiteEvent("Internal Anchor Clicked", payload);
      return;
    }

    const button = event.target.closest("button");
    if (!button) return;

    const payload = {
      label: button.textContent.replace(/\s+/g, " ").trim(),
      section: describeSection(button),
    };

    if (button.matches("[data-case-view-button]")) {
      trackSiteEvent("Case View Selected", {
        ...payload,
        case_view: button.dataset.caseViewButton || "",
      });
      return;
    }

    if (button.matches(".carousel-arrow")) {
      trackSiteEvent("Carousel Arrow Clicked", {
        ...payload,
        direction: button.classList.contains("left") ? "left" : "right",
      });
      return;
    }

    trackSiteEvent("Button Clicked", payload);
  });
})();
