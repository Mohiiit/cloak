import type { Metadata } from "next";
import { ScaffoldStarkAppWithProviders } from "~~/components/ScaffoldStarkAppWithProviders";
import "~~/styles/globals.css";
import { ThemeProvider } from "~~/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Cloak - Social Shielded Payments",
  description:
    "Social payments, cryptographically private. Built on Starknet with Tongo SDK.",
  icons: "/logo.ico",
};

const ScaffoldStarkApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning data-theme="dark" className="dark">
      <body suppressHydrationWarning className="bg-slate-900 text-slate-50">
        <ThemeProvider defaultTheme="dark" enableSystem={false}>
          <ScaffoldStarkAppWithProviders>
            {children}
          </ScaffoldStarkAppWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default ScaffoldStarkApp;
