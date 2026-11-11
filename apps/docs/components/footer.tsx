const links = [
  { href: "https://todalo.app", label: "Todalo home" },
  { href: "https://todalo.app/privacy", label: "Privacy" },
  { href: "https://todalo.app/terms", label: "Terms" },
  { href: "mailto:support@todalo.app", label: "support@todalo.app" },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink/70">
        {links.map((link) => (
          <li key={link.href}>
            <a className="underline-offset-4 hover:text-ink hover:underline" href={link.href}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}
