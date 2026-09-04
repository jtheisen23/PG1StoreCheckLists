import { getBranding } from "@/server/branding";

/** The fallback mark, used when an organization has no logo at all. */
function DefaultMark({ size }: { size: number }) {
  return (
    <span
      className="bg-brand-600 flex shrink-0 items-center justify-center rounded-lg"
      style={{ width: size, height: size, borderRadius: size / 3.4 }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" style={{ width: size * 0.6, height: size * 0.6 }}>
        <path
          d="M6 12.5l4 4 8-8"
          fill="none"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * The organization's logo and name, used everywhere the product identifies
 * itself. One component so a rebrand never has to be chased across pages.
 */
export async function Brand({
  size = 28,
  showName = true,
  className,
  nameClassName,
  logoClassName,
}: {
  size?: number;
  showName?: boolean;
  className?: string;
  nameClassName?: string;
  /** Width constraints for the logo; wordmarks need far more room than marks. */
  logoClassName?: string;
}) {
  const { orgName, logoUrl, logoAspect, isWordmark } = await getBranding();

  // A wordmark already spells the company out. Setting it next to the same
  // words again reads as a mistake, and on a phone it crowds out the logo.
  const withName = showName && !isWordmark;

  return (
    <span className={className ?? "flex items-center gap-2"}>
      {logoUrl ? (
        // A logo is an arbitrary uploaded image; `contain` keeps any aspect
        // ratio intact rather than cropping someone's wordmark.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={orgName}
          width={logoAspect ? Math.round(size * logoAspect) : undefined}
          height={size}
          // Bounded rather than fixed, so the box ends up exactly the size of
          // the artwork. A fixed height letterboxes a wide wordmark, which the
          // dark-mode chip would then draw as empty white bands around it.
          style={{ maxHeight: size }}
          // Not `shrink-0`: a wordmark is far wider than a mark, and one that
          // refuses to shrink overflows its parent and ends up painted over by
          // whatever sits beside it in the header.
          className={`brand-logo h-auto w-auto min-w-0 object-contain object-left ${logoClassName ?? "max-w-[240px]"}`}
        />
      ) : (
        <DefaultMark size={size} />
      )}
      {withName ? (
        <span className={nameClassName ?? "text-[14px] font-semibold tracking-tight"}>
          {orgName}
        </span>
      ) : null}
    </span>
  );
}
