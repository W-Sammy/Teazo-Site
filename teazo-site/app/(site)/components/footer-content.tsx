type FooterContentProps = {
  email: string;
};

export default function FooterContent({ email }: FooterContentProps) {
  return (
    <footer className="relative z-40 flex w-full flex-col items-center justify-center gap-4 bg-black py-10 text-[16px] text-white">
      <a href={`mailto:${email}`} className="transition hover:opacity-80">
        {email}
      </a>

      <span>© {new Date().getFullYear()} TEAZO. All rights reserved.</span>
    </footer>
  );
}
