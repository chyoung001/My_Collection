import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import GeneralTab from "./settings/GeneralTab";
import AppearanceTab from "./settings/AppearanceTab";
import PricingTab from "./settings/PricingTab";
import ConnectionTab from "./settings/ConnectionTab";
import AboutTab from "./settings/AboutTab";

const TABS = [
  { value: "general",    label: "일반",  Component: GeneralTab },
  { value: "appearance", label: "외관",  Component: AppearanceTab },
  { value: "pricing",    label: "시세",  Component: PricingTab },
  { value: "connection", label: "연결",  Component: ConnectionTab },
  { value: "about",      label: "정보",  Component: AboutTab },
];

export default function Settings() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      <div>
        <h2 className="font-poppins font-bold text-lg text-white">설정</h2>
        <p className="text-xs text-white/40 mt-0.5">
          대부분의 설정은 자동 저장되어 즉시 적용됩니다. (연결 설정은 저장 버튼 사용)
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ value, Component }) => (
          <TabsContent key={value} value={value}>
            <Component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
