import { PaintRoller } from "lucide-react";

export default function InDevelopment() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-accent">
      <PaintRoller className="size-20 mb-5" />
      <p className=" text-2xl text-center font-medium">
        Скоро здесь появится новый&nbsp;раздел
      </p>
    </div>
  );
}
