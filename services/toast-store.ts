export type ToastType = "success" | "error" | "info";

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
}

const toastStore = {
  state: {
    visible: false,
    message: "",
    type: "info" as ToastType,
  },
  listeners: new Set<(state: ToastState) => void>(),

  subscribe(listener: (state: ToastState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  notify() {
    this.listeners.forEach((listener) => listener(this.state));
  },

  show(message: string, type: ToastType = "info") {
    this.state = { visible: true, message, type };
    this.notify();

    // Auto-hide after 3 seconds
    setTimeout(() => {
      this.hide();
    }, 3000);
  },

  hide() {
    this.state = { ...this.state, visible: false };
    this.notify();
  },

  getState() {
    return this.state;
  },
};

export const showToast = (message: string, type: ToastType = "info") => {
  toastStore.show(message, type);
};

export { toastStore };
