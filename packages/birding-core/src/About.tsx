const ABOUT_URL = 'https://lizstanley.com/about/';

/** Who made the apps and why. The one core text that may name the Christmas Bird Count: it is the author's bio. */
export function About() {
  return (
    <div className="birding-about">
      <p>
        I&apos;m Liz Stanley, a software engineer, birder, and Minnesota Master Naturalist. I&apos;ve compiled the
        Bloomington, Minnesota Christmas Bird Count since 2020. I built these apps so compilers and counters can run
        count day from a phone, and so anyone can find the birds and birding spots near them the rest of the year.
        They are free, with no app store and no server.
      </p>
      <p>
        <a href={ABOUT_URL} target="_blank" rel="noreferrer">
          More about me
        </a>
      </p>
    </div>
  );
}
