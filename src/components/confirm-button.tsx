"use client";

/**
 * A submit button that asks first. For actions that cannot be undone and sit
 * in a list of near-identical rows, where a mis-click is easy and permanent.
 */
export function ConfirmButton({
  children,
  message,
  className,
  style,
  title,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      style={style}
      title={title}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
