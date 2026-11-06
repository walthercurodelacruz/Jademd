interface Window {
  jademdDesktop?: {
    onCloseRequested: (callback: () => void | Promise<void>) => () => void;
    readyToClose: () => void;
  };
}
