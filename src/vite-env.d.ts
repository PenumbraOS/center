/// <reference types="vite/client" />

interface USB {}

declare global {
  interface Navigator {
    usb?: USB;
  }
}

export {};
