interface IconProps {
  size?: number;
}

/** Three stacked horizontal dashes - the Settings trigger. */
export function HamburgerIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A bare upward arrow - the Generate/submit trigger. */
export function SendArrowIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 16V4M10 4L4.5 9.5M10 4l5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A small up/down double-chevron - signals "this opens a menu of options" next to the Model name. */
export function ChevronUpDownIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M4 8.5L7 11.5L10 8.5M4 5.5L7 2.5L10 5.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A bare leftward arrow - the icon-only "back to chats" trigger. */
export function BackArrowIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M15 9H3M3 9L8 4M3 9L8 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A paperclip - the "add another photo to this chat" trigger, left of the chat input. */
export function AttachIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M12.5 6.5L7.4 11.6a2.1 2.1 0 1 1-3-3l5.9-5.9a3.2 3.2 0 0 1 4.5 4.5L9 12.9a4.3 4.3 0 1 1-6-6l5.6-5.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A bare checkmark - the manual image-selection indicator. */
export function CheckIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 7.2L5.5 10.5L11.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A bare leftward chevron - the Lightbox's "previous image" trigger. Drawn rather than
 * the "‹" character it replaced: that glyph's ink sits noticeably off-center within its
 * own font metrics (its line-box, not the visible mark, is what flexbox centering actually
 * aligns), so the button looked centered by CSS but not to the eye. An SVG's viewBox has
 * no such built-in asymmetry - centering the box centers the mark.
 */
export function ChevronLeftIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12 4L7 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A bare rightward chevron - the Lightbox's "next image" trigger. See ChevronLeftIcon. */
export function ChevronRightIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M8 4L13 10L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
