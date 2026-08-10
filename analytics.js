(function () {
  const MAX_EVENT_PARAMS = 25;
  const MAX_PARAM_VALUE_LENGTH = 100;
  const GA_EVENT_NAMES = {
    "File Uploaded": "file_uploaded",
    "Upload Rejected": "upload_rejected",
    "Upload Failed": "upload_failed",
    "Language Changed": "language_changed",
    "Effect Added": "effect_added",
    "Effect Removed": "effect_removed",
    "Preview Started": "preview_started",
    "Export Started": "export_started",
    "Export Completed": "export_completed",
    "Export Failed": "export_failed",
    "Frame Tool Used": "frame_tool_used",
    "Invert Mask Toggled": "invert_mask_toggled",
    "Live Camera Started": "live_camera_started",
    "Live Camera Failed": "live_camera_failed",
    "Live Effect Changed": "live_effect_changed",
  };

  function normalizeEventName(name) {
    const normalized = String(name || "custom_event")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    return /^[a-z]/.test(normalized) ? normalized : `event_${normalized || "custom"}`;
  }

  function normalizeParamName(name) {
    const normalized = String(name || "param")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    return /^[a-z]/.test(normalized) ? normalized : `param_${normalized || "value"}`;
  }

  function normalizeEventData(data) {
    return Object.entries(data || {}).slice(0, MAX_EVENT_PARAMS).reduce((payload, [key, value]) => {
      const paramName = normalizeParamName(key);
      if (value == null) return payload;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        payload[paramName] =
          typeof value === "string" ? value.slice(0, MAX_PARAM_VALUE_LENGTH) : value;
      } else {
        payload[paramName] = JSON.stringify(value).slice(0, MAX_PARAM_VALUE_LENGTH);
      }
      return payload;
    }, {});
  }

  window.trackAnalyticsEvent = function (name, data) {
    const payload = normalizeEventData(data);
    try {
      window.va?.("event", { name, data: payload });
    } catch (err) {
      console.warn("Vercel Analytics event skipped", err);
    }

    try {
      window.gtag("event", GA_EVENT_NAMES[name] || normalizeEventName(name), payload);
    } catch (err) {
      console.warn("Google Analytics event skipped", err);
    }
  };
})();
