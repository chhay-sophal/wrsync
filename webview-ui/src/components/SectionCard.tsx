import { Card, CardHeader, Text, tokens } from "@fluentui/react-components";
import type { ReactElement, ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactElement | false;
  children: ReactNode;
}

export function SectionCard({ icon, title, description, action, children }: Props) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col !pb-1">
      <CardHeader
        image={
          <div
            className="flex h-8 w-8 items-center justify-center"
            style={{
              borderRadius: tokens.borderRadiusMedium,
              background: tokens.colorBrandBackground2,
              color: tokens.colorBrandForeground2,
            }}
          >
            {icon}
          </div>
        }
        header={
          <Text weight="semibold" size={400}>
            {title}
          </Text>
        }
        description={description ? <Text size={200}>{description}</Text> : undefined}
        action={action || undefined}
      />
      <div className="flex min-h-0 flex-1 flex-col mb-1">{children}</div>
    </Card>
  );
}
