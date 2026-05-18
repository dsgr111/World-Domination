import { Link } from "react-router";

type AppBrandLinkProps = {
  to?: string;
};

export function AppBrandLink({ to = "/" }: AppBrandLinkProps) {
  return (
    <Link
      to={to}
      className="text-lg font-bold transition-opacity hover:opacity-80"
      style={{ color: "#ffffff" }}
    >
      МИРОВОЕ ГОСПОДСТВО
    </Link>
  );
}
