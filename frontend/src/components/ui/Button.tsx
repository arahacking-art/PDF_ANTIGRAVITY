import React from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          {
            // Default: solid blue, always white text
            'bg-blue-600 text-white hover:bg-blue-700 shadow-sm': variant === 'default',
            // Outline: visible border + explicit dark text so it shows on gray bg
            'border-2 border-gray-400 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-500': variant === 'outline',
            // Ghost: subtle, explicit text color
            'bg-transparent text-gray-600 hover:bg-gray-200 hover:text-gray-900': variant === 'ghost',
            'h-10 py-2 px-4': size === 'default',
            'h-9 px-3 rounded-md': size === 'sm',
            'h-11 px-8 rounded-md': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export default Button;
