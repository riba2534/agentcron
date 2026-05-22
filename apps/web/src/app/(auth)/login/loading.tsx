import { Skeleton } from '@/components/ui/skeleton';
export default function Loading() {
  return (
    <div className="w-full space-y-4 rounded-lg border border-neutral-200 bg-neutral-0 p-6 shadow-md dark:border-neutral-800 dark:bg-neutral-950">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
