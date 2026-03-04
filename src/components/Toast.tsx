"use client";

interface ToastProps {
  message: string;
  visible: boolean;
}

export function Toast({ message, visible }: ToastProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed right-4 top-20 z-[70] rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-md">
      {message}
    </div>
  );
}
