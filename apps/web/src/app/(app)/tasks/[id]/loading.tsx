import { Skeleton } from '@/components/ui/skeleton';
export default function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
