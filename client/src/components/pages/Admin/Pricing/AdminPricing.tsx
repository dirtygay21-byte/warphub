import {
  BILLING_MODE_LABELS,
  getAdminServicePrices,
  saveAdminServicePrice,
  setAdminServiceAutoConfirm,
  type BillingMode,
  type ServicePrice,
} from "@/apiUtils/pricing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, RefreshCw, RussianRuble, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ToggleRow } from "@/components/ui/ds";

const inputClass =
  "mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-field px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-accent/60";

const GROUP_TRAINING_SLUG = "wh_group_training";
const WARHAMMER_SLUGS = new Set(["wh_game", "wh_group_training", "wh_solo_training"]);
const PAINTING_SLUG = "wh_painting";

function ServicePriceCard({ service }: { service: ServicePrice }) {
  const queryClient = useQueryClient();
  const isGroupTraining = service.slug === GROUP_TRAINING_SLUG;
  const isPainting = service.slug === PAINTING_SLUG;
  const isWarhammer = WARHAMMER_SLUGS.has(service.slug);
  const [billingMode, setBillingMode] = useState<BillingMode>(service.billingMode);
  const [unitPrice, setUnitPrice] = useState(String(service.unitPrice));
  const [ownMaterialsPrice, setOwnMaterialsPrice] = useState(String(service.ownMaterialsPrice));
  const [clubMaterialsPrice, setClubMaterialsPrice] = useState(String(service.clubMaterialsPrice));
  const [armyRentalPrice, setArmyRentalPrice] = useState(String(service.armyRentalPricePer1000));
  const [thirdDiscount, setThirdDiscount] = useState(String(service.thirdGameDiscountPercent));

  const save = useMutation({
    meta: { success: `Тариф «${service.title ?? service.slug}» сохранён` },
    mutationFn: () =>
      saveAdminServicePrice(service.id, {
        billingMode,
        unitPrice: isPainting ? Number(ownMaterialsPrice) : Number(unitPrice),
        ...(isPainting ? {
          ownMaterialsPrice: Number(ownMaterialsPrice),
          clubMaterialsPrice: Number(clubMaterialsPrice),
        } : {}),
        ...(isWarhammer ? { armyRentalPricePer1000: Number(armyRentalPrice) } : {}),
        ...(isGroupTraining ? { thirdGameDiscountPercent: Number(thirdDiscount) } : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-service-prices"] }),
  });

  const autoConfirm = useMutation({
    meta: { success: "Подтверждение записей сохранено", error: true },
    mutationFn: (value: boolean) => setAdminServiceAutoConfirm(service.id, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-service-prices"] }),
  });

  const price = isPainting ? Number(ownMaterialsPrice) : Number(unitPrice);
  const clubPrice = Number(clubMaterialsPrice);
  const rentalPrice = Number(armyRentalPrice);
  const third = Number(thirdDiscount);
  const invalid =
    !Number.isFinite(price) ||
    price < 0 ||
    (isPainting && (!Number.isFinite(clubPrice) || clubPrice < 0)) ||
    (isWarhammer && (!Number.isFinite(rentalPrice) || rentalPrice < 0)) ||
    (isGroupTraining && (!Number.isFinite(third) || third < 0 || third > 100));
  const unchanged =
    price === (isPainting ? service.ownMaterialsPrice : service.unitPrice) &&
    billingMode === service.billingMode &&
    (!isPainting || clubPrice === service.clubMaterialsPrice) &&
    (!isWarhammer || rentalPrice === service.armyRentalPricePer1000) &&
    (!isGroupTraining || third === service.thirdGameDiscountPercent);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!invalid && !unchanged) save.mutate();
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-white/10 bg-app-elevated p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{service.title ?? service.slug}</h2>
          <p className="mt-0.5 font-mono text-xs text-fg-3">{service.slug}</p>
        </div>
        <span className="rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
          {BILLING_MODE_LABELS[billingMode]}
        </span>
      </div>

      <div className="mb-3">
        <ToggleRow
          title="Подтверждать автоматически"
          subtitle={
            (autoConfirm.isPending ? autoConfirm.variables : (service.autoConfirm ?? true))
              ? "Новая запись сразу подтверждена"
              : "Новая запись ждёт подтверждения администратора"
          }
          checked={autoConfirm.isPending ? !!autoConfirm.variables : (service.autoConfirm ?? true)}
          onChange={(value) => autoConfirm.mutate(value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-fg-2">
          Модель расчёта
          <select
            value={billingMode}
            onChange={(event) => setBillingMode(event.target.value as BillingMode)}
            className={inputClass}
          >
            {Object.entries(BILLING_MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        {!isPainting && (
          <label className="text-xs font-medium text-fg-2">
            Цена, ₽
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              className={inputClass}
              required
            />
          </label>
        )}
        {isPainting && (
          <>
            <label className="text-xs font-medium text-fg-2">
              Со своими красками, ₽ / человек
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={ownMaterialsPrice}
                onChange={(event) => setOwnMaterialsPrice(event.target.value)}
                className={inputClass}
                required
              />
            </label>
            <label className="text-xs font-medium text-fg-2">
              С красками клуба, ₽ / человек
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={clubMaterialsPrice}
                onChange={(event) => setClubMaterialsPrice(event.target.value)}
                className={inputClass}
                required
              />
            </label>
          </>
        )}
        {isWarhammer && (
          <label className="text-xs font-medium text-fg-2">
            Аренда армии, ₽ / 1000 очков
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={armyRentalPrice}
              onChange={(event) => setArmyRentalPrice(event.target.value)}
              className={inputClass}
              required
            />
          </label>
        )}
        {isGroupTraining ? (
          <label className="text-xs font-medium text-fg-2">
            Скидка на первые три игры, %
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              inputMode="decimal"
              value={thirdDiscount}
              onChange={(event) => setThirdDiscount(event.target.value)}
              className={inputClass}
              required
            />
          </label>
        ) : !isWarhammer ? (
          <p className="self-end pb-2 text-xs leading-5 text-fg-3">
            Скидки за членство и мини‑игры добавляются в счёте записи.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-fg-3">
          {billingMode === "per_guest" && "Итог = цена × число гостей."}
          {billingMode === "per_table" && "Итог = цена за стол; если за столом несколько игроков — делится между ними поровну."}
          {billingMode === "per_pair" && "Итог = цена × число пар; нечётный гость считается как пара."}
          {isWarhammer && ` Аренда = очки × ${armyRentalPrice || "0"} / 1000; команда Kill Team и варбанда Warcry — как 1000 очков.`}
        </p>
        <button
          type="submit"
          disabled={invalid || unchanged || save.isPending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {save.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          Сохранить тариф
        </button>
      </div>
      {save.isError && <p className="mt-3 text-sm text-red-200">{save.error.message}</p>}
    </form>
  );
}

export default function AdminPricing() {
  const query = useQuery({ queryKey: ["admin-service-prices"], queryFn: getAdminServicePrices });

  return (
    <div className="px-4 py-3 pb-28 text-white sm:px-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold uppercase leading-none">Цены и скидки</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-3">
            Тарифы по услугам. Новая цена сохраняется в истории и применяется к новым записям; уже рассчитанные счета не меняются.
          </p>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          aria-label="Обновить тарифы"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/3 disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mb-4 flex gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-4 text-sm leading-6 text-fg-2">
        <RussianRuble className="mt-1 size-5 shrink-0 text-accent" />
        <p>Оплата, остаток, членская и ручная скидки, а также коды мини‑игр находятся в разделе «Все записи» → «Счёт».</p>
      </div>

      {query.isLoading && (
        <div className="flex justify-center py-16"><LoaderCircle className="size-8 animate-spin text-accent" /></div>
      )}
      {query.isError && (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
          {query.error.message}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {query.data?.map((service) => (
          <ServicePriceCard
            key={`${service.id}:${service.billingMode}:${service.unitPrice}:${service.ownMaterialsPrice}:${service.clubMaterialsPrice}:${service.armyRentalPricePer1000}:${service.thirdGameDiscountPercent}`}
            service={service}
          />
        ))}
      </div>
      {query.data?.length === 0 && <p className="py-12 text-center text-sm text-fg-3">Услуги не найдены.</p>}
    </div>
  );
}
