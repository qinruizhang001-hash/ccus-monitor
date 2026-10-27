import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel max-w-lg rounded-xl p-6">
      <h1 className="text-lg font-semibold">没有这个页面</h1>
      <p className="mt-2 text-sm text-muted-foreground">回到总览看捕集、运输、封存和 MVA。</p>
      <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
        返回总览
      </Link>
    </div>
  );
}
