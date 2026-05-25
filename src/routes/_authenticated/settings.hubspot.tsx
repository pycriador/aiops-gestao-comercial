import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings/hubspot")({
  component: () => (
    <div>
      <PageHeader title="Integração HubSpot" description="Mapeamento de imobiliárias para Companies do HubSpot." />
      <div className="p-6 lg:p-10">
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          Integração com HubSpot em construção. Aqui ficará o mapeamento entre imobiliárias e Companies/Contacts.
        </CardContent></Card>
      </div>
    </div>
  ),
});
