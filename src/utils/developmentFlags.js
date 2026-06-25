export function getDevelopmentDisabledPages(user) {
  return Array.isArray(user?.developmentDisabledPages)
    ? user.developmentDisabledPages
    : Array.isArray(user?.development_disabled_pages)
      ? user.development_disabled_pages
      : [];
}

export function isPageDevelopmentDisabled(user, pageId) {
  if (!user || !pageId) return false;

  return getDevelopmentDisabledPages(user).includes(pageId);
}
