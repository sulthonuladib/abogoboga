import { Button } from "@lister/ui/components/button"
import { Link } from "react-router"
import { PageHeader } from "../ui/PageHeader.tsx"

/**
 * Client route with no matching view.
 */
export const NotFoundPage = () => (
  <>
    <PageHeader
      title="Page not found"
      description="This address does not match any control-plane view. It may have been a retired server-rendered route."
    />
    <div>
      <Button variant="outline" render={<Link to="/dashboard" />}>
        Go to dashboard
      </Button>
    </div>
  </>
)
