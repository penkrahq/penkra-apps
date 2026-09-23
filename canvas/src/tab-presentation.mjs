export function createTabPresentation(tab, onError = console.warn) {
  let desiredTitle;
  let appliedTitle;
  let pending = Promise.resolve();

  return {
    update(title) {
      const nextTitle = typeof title === "string" && title.trim() ? title.trim() : null;
      if (nextTitle === desiredTitle) return pending;
      desiredTitle = nextTitle;
      pending = pending.then(async () => {
        if (desiredTitle === appliedTitle) return;
        const titleToApply = desiredTitle;
        try {
          if (titleToApply) await tab.setPresentation({ title: titleToApply });
          else await tab.resetPresentation();
          appliedTitle = titleToApply;
        } catch (error) {
          onError("Canvas could not update its tab title.", error);
        }
      });
      return pending;
    },
  };
}
