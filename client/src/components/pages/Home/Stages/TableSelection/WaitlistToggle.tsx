import { getMyWaitlist, joinWaitlist, leaveWaitlist } from "@/apiUtils/booking";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "@/stores/useToastStore";
import { haptic } from "@/utils/haptic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";

/**
 * Лист ожидания (этап 2, 15.11.2026): день занят или удобного времени нет — «напишите, если освободится место».
 * Бот пишет один раз, когда кто-то отменит запись этой услуги на этот день.
 */
export default function WaitlistToggle({ serviceId, date, full }: { serviceId: number; date: string; full: boolean }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["waitlist"], queryFn: getMyWaitlist, enabled: isAuthenticated });
  const waiting = !!list.data?.some((w) => w.serviceId === serviceId && w.date === date);
  const mutation = useMutation({
    mutationFn: () => (waiting ? leaveWaitlist(serviceId, date) : joinWaitlist(serviceId, date)),
    onSuccess: (r) => {
      haptic.ok();
      toast.success(r.waiting ? "Напишем в боте, если место освободится" : "Больше не ждём этот день");
      void queryClient.invalidateQueries({ queryKey: ["waitlist"] });
    },
    onError: (e) => toast.error((e as Error).message || "Не получилось — попробуйте ещё раз"),
  });
  if (!isAuthenticated) return null;

  return (
    <button
      type="button"
      disabled={mutation.isPending || list.isLoading}
      onClick={() => (haptic.tap(), mutation.mutate())}
      aria-pressed={waiting}
      className={`ds-press flex w-full items-center gap-3 rounded-[16px] border px-4 py-3 text-left disabled:opacity-60 ${
        waiting ? "border-accent bg-accent/10" : "border-white/10 bg-app-elevated"
      }`}
    >
      {waiting ? <BellRing className="size-5 shrink-0 text-accent" /> : <Bell className="size-5 shrink-0 text-accent" />}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-fg">
          {waiting ? "Ждём место — напишем в боте" : full ? "Всё занято? Напишем, если освободится" : "Нет удобного времени?"}
        </span>
        <span className="mt-0.5 block text-[13px] text-fg-2">
          {waiting ? "Нажмите, чтобы больше не ждать" : "Если кто-то отменит запись на этот день — придёт сообщение"}
        </span>
      </span>
    </button>
  );
}
