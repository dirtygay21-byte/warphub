type PluralForms = {
  one: string;
  few: string;
  many: string;
};

export const pluralizeRu = (count: number, forms: PluralForms) => {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return forms.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms.few;
  }

  return forms.many;
};

export const getRecordsLabel = (count: number) =>
  pluralizeRu(count, { one: "запись", few: "записи", many: "записей" });

export const getSeatsLabel = (count: number) =>
  pluralizeRu(count, { one: "место", few: "места", many: "мест" });

export const getFreeSeatsLabel = (count: number) =>
  pluralizeRu(count, {
    one: "свободное место",
    few: "свободных места",
    many: "свободных мест",
  });

export const getSeatLabel = (index: number) => {
  if (index === 0) return "Для себя";
  if (index === 1) return "Для оппонента";

  return `Место ${index + 1}`;
};

export const getBuyFigureSeatLabel = (index: number) =>
  index === 0 ? "Для себя" : `Место ${index + 1}`;
