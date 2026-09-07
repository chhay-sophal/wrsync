import { Button, Card, Text, Title2, tokens } from "@fluentui/react-components";
import { WeatherMoonRegular, WeatherSunnyRegular } from "@fluentui/react-icons";

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
}

function App({ isDark, onToggleTheme }: Props) {
  return (
    <div className="flex h-screen flex-col" style={{ background: tokens.colorNeutralBackground2 }}>
      <header
        className="flex items-center justify-between px-6 py-2.5"
        style={{
          background: tokens.colorNeutralBackground1,
          borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
        }}
      >
        <Text weight="semibold" size={500}>
          Web Resource Sync
        </Text>
        <Button
          appearance="subtle"
          icon={isDark ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
          onClick={onToggleTheme}
        />
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-[420px] p-6">
          <Title2 as="h1" className="mb-2">
            Hello from React
          </Title2>
          <Text className="block">
            Fluent UI components and Tailwind layout classes, both rendering correctly
            inside a VS Code webview.
          </Text>
        </Card>
      </main>
    </div>
  );
}

export default App;
