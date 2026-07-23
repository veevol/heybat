export default function SubmitSpinner({ className = 'h-4 w-4' }) {
  return (
    <svg
      className={`heybat-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="heybat-submit-spinner" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD500" stopOpacity="0" />
          <stop offset="55%" stopColor="#FFD500" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#FFD500" stopOpacity="1" />
        </linearGradient>
      </defs>
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="url(#heybat-submit-spinner)"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeDasharray="42 20"
      />
    </svg>
  );
}
