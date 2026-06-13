import { createContext } from "react";

// Context per condividere tasks/dispatch (per messaggi con taskLink — v0.8)
export const ChatContext = createContext({ tasks: [], dispatch: () => {} });
