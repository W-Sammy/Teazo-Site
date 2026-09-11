export function InviteSwitch({
  checked,
  locked = false,
  unavailable = false,
  onClick,
}: {
  checked: boolean;
  locked?: boolean;
  unavailable?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Allow user invitations"
      aria-disabled={locked || unavailable}
      onClick={onClick}
      className={`relative h-5 w-9 flex-none overflow-hidden rounded-full p-0 transition-colors ${
        checked ? "bg-pink-300" : "bg-gray-200"
      } ${
        locked
          ? "cursor-not-allowed opacity-70"
          : unavailable
            ? "cursor-not-allowed opacity-50"
            : ""
      }`}
    >
      <span
        className={`pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
