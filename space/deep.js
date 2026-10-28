/* The weekly long-form's evergreen parts: one deep dive per episode (rotating by week) and a few rapid-fire facts.
   Every line here is a settled, checkable fact (NASA / NOAA figures), written so it stays true as time passes
   ("more than 25 years", not "25 years"). Each part has a big number for the screen, what it counts, and what the
   narrator says; "bg" is the NASA footage topic behind it (see broll.js).
   Sources for each deep dive are listed with it and go in the fact sheet. */
"use strict";
const DEEP = [
  { id: "iss", title: "Life on the Space Station", bg: "earth", sources: ["https://www.nasa.gov/international-space-station/space-station-facts-and-figures/", "https://www.nasa.gov/international-space-station/space-station-deorbit-vehicle/"],
    parts: [
      { big: "250", unit: "Miles above Earth", say: "The International Space Station orbits about 250 miles above Earth, and it's fast: about 17,500 miles per hour. At that speed it circles the whole planet roughly every 90 minutes, so the crew sees about 16 sunrises and 16 sunsets every single day." },
      { big: "2000", unit: "Crewed nonstop since", say: "People have been living on board without a break since November 2000. That's more than 25 years of nonstop human life in space, with astronauts from around the world rotating through, usually for about six months at a time." },
      { big: "356 FT", unit: "End to end", say: "The station is about the size of a football field, 356 feet from end to end, and it weighs close to a million pounds. It was built piece by piece in orbit, over more than 40 launches." },
      { big: "2 HRS", unit: "Of exercise a day", say: "Living in microgravity is hard on the body. Without gravity pulling on them, muscles and bones get weaker, so astronauts work out about two hours every day, on a treadmill, an exercise bike and a special weightlifting machine." },
      { big: "98%", unit: "Of water recycled", say: "Water is precious up there. The station's life support system recycles about 98 percent of the crew's water, including sweat and urine, and turns it back into clean drinking water." },
      { big: "SLEEP", unit: "Tied to the wall", say: "Even sleeping is different. Astronauts sleep in small private cabins, zipped into sleeping bags that are tied to the wall so they don't drift around while they snooze." },
      { big: "2030", unit: "Planned retirement", say: "The station won't last forever. NASA plans to retire it around 2030, and it picked SpaceX to build a vehicle that will steer it down to a controlled re-entry over a remote part of the Pacific Ocean. Private space stations are being built to take its place." }] },
  { id: "orbit", title: "How Rockets Reach Orbit", bg: "launch", sources: ["https://www.nasa.gov/learning-resources/for-kids-and-students/what-is-an-orbit-grades-5-8/", "https://www.spacex.com/vehicles/falcon-9/"],
    parts: [
      { big: "62 MI", unit: "Where space begins", say: "Space is usually said to begin about 62 miles up, and a rocket can get that high in just a few minutes. But getting high isn't the hard part. Staying up is." },
      { big: "17,500", unit: "MPH to stay in orbit", say: "To stay in low Earth orbit, a spacecraft has to move sideways at about 17,500 miles per hour. An orbit is really a never-ending fall: the spacecraft is falling toward Earth the whole time, but it's moving so fast that the ground curves away beneath it." },
      { big: "STAGES", unit: "Drop the dead weight", say: "That's why rockets come in stages. Each stage burns its fuel and then drops away, so the rest of the rocket doesn't have to haul empty tanks all the way to orbit. Most rockets that reach orbit use two or three stages." },
      { big: "2015", unit: "First booster landing", say: "For decades, those boosters were thrown away after a single flight. Then in December 2015, SpaceX landed a Falcon 9 first stage back on the ground after a launch to orbit. Now landing and reflying boosters is routine, and some have flown more than 20 times." },
      { big: "MAX Q", unit: "Peak stress", say: "About a minute after liftoff, a rocket hits what engineers call max Q, the moment when its speed and the thickness of the air combine to push hardest on the vehicle. Get through that, and the air quickly thins out." },
      { big: "25,000", unit: "MPH to escape Earth", say: "And to leave Earth behind completely, heading for the Moon or Mars, a spacecraft needs even more: about 25,000 miles per hour. That's called escape velocity." },
      { big: "EAST", unit: "The free speed boost", say: "Most rockets launch toward the east, and there's a good reason. Earth spins eastward at more than 900 miles per hour at Cape Canaveral, and a rocket gets that speed for free. That's also why launch sites sit near the coast, with open ocean to the east." }] },
  { id: "sun", title: "The Sun Up Close", bg: "sun", sources: ["https://science.nasa.gov/sun/facts/", "https://www.nasa.gov/news-release/nasa-noaa-sun-reaches-maximum-phase-in-11-year-solar-cycle/", "https://sdo.gsfc.nasa.gov/"],
    parts: [
      { big: "93M", unit: "Miles away", say: "The Sun is about 93 million miles away. Its light takes a little over eight minutes to reach us, so the sunlight hitting you right now left the Sun about eight minutes ago." },
      { big: "109", unit: "Earths across", say: "It's enormous. About 109 Earths would fit side by side across its face, and the Sun holds more than 99 percent of all the mass in our solar system." },
      { big: "27M °F", unit: "At the core", say: "Deep in its core, nuclear fusion turns hydrogen into helium at about 27 million degrees Fahrenheit. That's what makes the Sun shine. The visible surface is a much cooler, but still blistering, 10,000 degrees." },
      { big: "11 YRS", unit: "One solar cycle", say: "The Sun's activity rises and falls on a cycle of about 11 years. Near solar maximum, sunspots, flares and eruptions are common. In October 2024, NASA and NOAA announced that the Sun had reached the maximum period of the current cycle, Solar Cycle 25." },
      { big: "SPOTS", unit: "Cooler patches", say: "Sunspots look dark only because they're cooler than the surface around them, by a few thousand degrees. They're areas of intense magnetic activity, and many of them are bigger than Earth." },
      { big: "1M°+", unit: "The corona", say: "Here's a mystery: the Sun's thin outer atmosphere, the corona, is far hotter than its surface, more than a million degrees. Figuring out why is one of the big goals of NASA's Parker Solar Probe, which has flown closer to the Sun than any spacecraft before it." },
      { big: "SDO", unit: "Watching since 2010", say: "NASA's Solar Dynamics Observatory has been watching the Sun almost nonstop since 2010, taking detailed images every 12 seconds in many colors of light. The Sun footage in this segment comes from it." }] },
  { id: "defense", title: "Defending Earth From Asteroids", bg: "asteroid", sources: ["https://science.nasa.gov/planetary-defense/", "https://science.nasa.gov/mission/dart/", "https://science.nasa.gov/mission/osiris-rex/", "https://science.nasa.gov/solar-system/asteroids/apophis/"],
    parts: [
      { big: "35,000+", unit: "Near-Earth asteroids found", say: "Astronomers have found more than 35,000 near-Earth asteroids, and they discover thousands more every year. The good news: none of the large ones we know about has a significant chance of hitting Earth for at least the next hundred years." },
      { big: "2022", unit: "DART hits an asteroid", say: "In September 2022, NASA's DART spacecraft slammed into a small asteroid moon called Dimorphos on purpose, at about 14,000 miles per hour. It was the first test of moving an asteroid, and it worked: Dimorphos's orbit got about 32 minutes shorter." },
      { big: "2023", unit: "Asteroid sample lands", say: "A year later, NASA's OSIRIS-REx mission dropped a capsule into the Utah desert, carrying rocks and dust from asteroid Bennu. Scientists have since found ingredients of life in it, including amino acids and all five bases used in DNA and RNA." },
      { big: "2029", unit: "Apophis flies by", say: "Mark your calendar for April 13th, 2029. That's when asteroid Apophis, about 1,100 feet wide, will pass within about 20,000 miles of Earth, closer than some satellites. It will safely miss us, and it may be visible to the naked eye from parts of the world." },
      { big: "2016", unit: "Planetary defense office", say: "NASA even has an office just for this: the Planetary Defense Coordination Office, set up in 2016 to find and track asteroids and comets, and to plan what we would do if one were ever headed our way." },
      { big: "66M", unit: "Years ago", say: "About 66 million years ago, an asteroid roughly six miles wide slammed into what's now Mexico's Yucatán Peninsula. That impact helped wipe out the dinosaurs." },
      { big: "2013", unit: "Chelyabinsk", say: "Why does all this matter? In February 2013, a space rock about 60 feet wide exploded in the sky over Chelyabinsk, Russia. The blast shattered windows across the city and injured about 1,500 people, mostly from flying glass." }] },
  { id: "moon", title: "Secrets of the Moon", bg: "moon", sources: ["https://science.nasa.gov/moon/facts/", "https://science.nasa.gov/moon/formation/"],
    parts: [
      { big: "4.5B", unit: "Years old", say: "The Moon formed about four and a half billion years ago. The leading idea is that a world about the size of Mars crashed into the young Earth, and the debris from that collision came together to make the Moon." },
      { big: "1.5 IN", unit: "Farther every year", say: "The Moon is slowly drifting away from us, about one and a half inches every year. We know because Apollo astronauts left mirrors on the surface, and scientists still bounce lasers off them to measure the distance." },
      { big: "1 FACE", unit: "Always toward us", say: "We always see the same side of the Moon. It spins exactly once for every trip around Earth, a lock caused by Earth's gravity. And the far side isn't dark: it gets just as much sunlight as the side we see." },
      { big: "12", unit: "Apollo moonwalkers", say: "During NASA's Apollo missions, between 1969 and 1972, 12 astronauts walked on the Moon. Their footprints are probably still there, because there's no wind or rain to wash them away." },
      { big: "QUAKES", unit: "Moonquakes", say: "The Moon has quakes too. Instruments left behind by Apollo astronauts recorded moonquakes, and some of the shallow ones kept shaking for more than ten minutes." },
      { big: "ICE", unit: "At the south pole", say: "There's water ice on the Moon, hiding in craters near the south pole that never see sunlight. That ice could one day be turned into drinking water, air and even rocket fuel, which is why the south pole is a top target for future astronauts." },
      { big: "1/6", unit: "Of Earth's gravity", say: "Gravity on the Moon is about one sixth of Earth's. Someone who weighs 150 pounds here would weigh about 25 pounds there, and could jump roughly six times higher." }] },
  { id: "aurora", title: "What Makes the Northern Lights", bg: "aurora", sources: ["https://www.swpc.noaa.gov/phenomena/aurora", "https://www.swpc.noaa.gov/news/g5-conditions-observed", "https://science.nasa.gov/sun/what-is-the-solar-wind/"],
    parts: [
      { big: "1M MPH", unit: "The solar wind", say: "It all starts at the Sun. The Sun constantly blows out a stream of charged particles called the solar wind, racing outward at around a million miles per hour." },
      { big: "SHIELD", unit: "Earth's magnetic field", say: "Earth's magnetic field acts like a shield and turns most of it away. But some of those particles get steered down toward the north and south poles, where they crash into gases high in our atmosphere and make them glow." },
      { big: "60-200", unit: "Miles up", say: "Most auroras glow somewhere between about 60 and 200 miles up. The colors depend on the gas: green and red come from oxygen, and blue and purple come from nitrogen." },
      { big: "G5", unit: "May 2024 storm", say: "In May 2024, the strongest geomagnetic storm in more than 20 years lit up skies with auroras as far south as Florida and Mexico. NOAA rated it G5, the very top of its scale." },
      { big: "BOTH", unit: "Poles", say: "Auroras happen at both ends of the planet. In the north they're the aurora borealis, the northern lights. In the south, they're the aurora australis, the southern lights." },
      { big: "JUPITER", unit: "Has them too", say: "And Earth isn't the only planet with auroras. Jupiter and Saturn have them too, and Jupiter's auroras are bigger than our entire planet." },
      { big: "TIP", unit: "Use your phone", say: "Here's a tip: your phone camera often sees more than your eyes. A faint aurora can look gray to the naked eye, but a long-exposure photo can pull out the color. Get away from city lights, and point it north." }] }
];

// rapid-fire facts (a few per episode, rotating); "big" is the one word or number on screen
const FACTS = [
  { big: "243", unit: "Days", bg: "sun", say: "A day on Venus is longer than its year. It takes Venus 243 Earth days to spin once, but only 225 days to circle the Sun." },
  { big: "1,000+", unit: "Earths inside", bg: "earth", say: "Jupiter is so big that more than a thousand Earths could fit inside it." },
  { big: "1B TONS", unit: "Per teaspoon", bg: "sun", say: "Neutron stars are so dense that a single teaspoon of one would weigh about a billion tons." },
  { big: "FLOATS", unit: "Saturn", bg: "earth", say: "Saturn is less dense than water. In a big enough bathtub, it would float." },
  { big: "2.5X", unit: "Everest", bg: "earth", say: "Mars has the tallest volcano in the solar system. Olympus Mons is about two and a half times as tall as Mount Everest." },
  { big: "4.2", unit: "Light-years", bg: "earth", say: "The closest star to the Sun, Proxima Centauri, is about 4.2 light-years away. Its light left more than four years before it reaches your eyes." },
  { big: "SILENT", unit: "No air, no sound", bg: "earth", say: "Space is silent. Sound needs air or something else to travel through, and space is almost completely empty." },
  { big: "2 IN", unit: "Taller in space", bg: "earth", say: "Astronauts can grow up to about two inches taller in space, because their spines stretch out without gravity pressing down. They shrink back once they're home." },
  { big: "88", unit: "Days in a year", bg: "sun", say: "A year on Mercury lasts just 88 Earth days. It's the fastest planet around the Sun." },
  { big: "98°", unit: "Tilt", bg: "earth", say: "Uranus spins on its side. It's tipped over at about 98 degrees, so it rolls around the Sun like a ball." },
  { big: "100,000", unit: "Light-years across", bg: "earth", say: "Our galaxy, the Milky Way, is about 100,000 light-years across, and our solar system is just one of billions of star systems in it." },
  { big: "15B+ MI", unit: "Voyager 1", bg: "earth", say: "Voyager 1, launched in 1977, is the farthest human-made object ever, more than 15 billion miles from Earth." },
  { big: "1M+", unit: "Earths in the Sun", bg: "sun", say: "More than a million Earths could fit inside the Sun." },
  { big: "8 MIN", unit: "Sunlight's trip", bg: "sun", say: "Sunlight takes a little over eight minutes to reach Earth. If the Sun vanished, we wouldn't know for eight minutes." },
  { big: "MOONS", unit: "Saturn", bg: "moon", say: "Saturn has more known moons than any other planet in our solar system, well over a hundred." },
  { big: "-208°F", unit: "Moon at night", bg: "moon", say: "On the Moon, temperatures swing from about 250 degrees Fahrenheit in sunlight to around minus 208 in the dark." }
];

// what to look for in the evening sky this month (mid-northern latitudes, a couple of hours after sunset)
const SKY = [
  { big: "M42", unit: "Orion Nebula", say: "January nights belong to Orion, high in the south. Below his belt hangs a fuzzy patch, the Orion Nebula, a stellar nursery about 1,300 light-years away where new stars are being born. Binoculars make it pop." },
  { big: "SIRIUS", unit: "Brightest star", say: "This month, follow Orion's belt down and to the left to find Sirius, the brightest star in the night sky. It's about 8.6 light-years away, one of our closest stellar neighbors." },
  { big: "POLARIS", unit: "The North Star", say: "In March, the Big Dipper rides high in the northeast after dark. Follow the two stars at the end of its bowl, and they point straight to Polaris, the North Star." },
  { big: "ARCTURUS", unit: "Arc to Arcturus", say: "Here's a spring trick: follow the curve of the Big Dipper's handle to arc to Arcturus, a bright orange star, then speed on to Spica, a blue-white star lower in the southeast." },
  { big: "37 LY", unit: "Arcturus", say: "On May evenings, the bright orange star Arcturus shines high in the east-southeast. It's one of the brightest stars in the sky, about 37 light-years away." },
  { big: "TRIANGLE", unit: "Summer Triangle", say: "Look east after dark in June for the Summer Triangle, three bright stars: Vega, Deneb and Altair. And low in the south, find the red star Antares, the heart of Scorpius." },
  { big: "26,000", unit: "Light-years to the center", say: "July is prime time for the Milky Way. From a dark site, look south after dark toward Sagittarius, where the stars form the shape of a teapot. The center of our galaxy lies in that direction, about 26,000 light-years away." },
  { big: "MILKY WAY", unit: "Overhead", say: "The Summer Triangle is high overhead on August evenings, and the Milky Way runs right through it. Get away from city lights, give your eyes 20 minutes to adjust, and look up." },
  { big: "PEGASUS", unit: "The Great Square", say: "In September, the Summer Triangle is still high after dark, and the Great Square of Pegasus is rising in the east: a big box of four stars that marks the start of the autumn sky." },
  { big: "2.5M LY", unit: "Andromeda Galaxy", say: "This month, look for the Great Square of Pegasus high in the east after dark. From one corner, a line of stars leads to the Andromeda Galaxy, a faint smudge of light. At about 2.5 million light-years away, it's the most distant thing most people can see with their own eyes." },
  { big: "PLEIADES", unit: "The Seven Sisters", say: "On November evenings, look east for a tiny, misty cluster of stars: the Pleiades, also called the Seven Sisters. Most people can see about six of its stars, but binoculars reveal dozens. Below it, the orange star Aldebaran marks the eye of Taurus the Bull." },
  { big: "ORION", unit: "Rising in the east", say: "By mid-evening in December, Orion is climbing in the east. Look for the three stars in a row that make his belt, the red star Betelgeuse at his shoulder, and blue-white Rigel at his knee." }];

// this week in space history: well-documented dates (local date where it happened, US Eastern for NASA events).
// txt follows "On <Month> <day>, <year>," in the narration; short is the line on screen.
const HIST = [
  ["01-01", 2019, "NASA's New Horizons flew past Arrokoth, an icy world about four billion miles from the Sun, the most distant object ever explored up close.", "New Horizons flies past Arrokoth", "earth"],
  ["01-04", 2004, "NASA's Spirit rover bounced to a landing on Mars, wrapped in airbags. It was built for a 90-day mission and kept exploring for more than six years.", "Spirit rover lands on Mars", "earth"],
  ["01-07", 1610, "Galileo pointed his telescope at Jupiter and spotted three of the moons we now call the Galilean moons.", "Galileo spots Jupiter's moons", "earth"],
  ["01-25", 2004, "the Opportunity rover landed on Mars. Planned for 90 days, it kept exploring for almost 15 years.", "Opportunity lands on Mars", "earth"],
  ["01-28", 1986, "the Space Shuttle Challenger broke apart shortly after launch, and all seven astronauts were lost.", "Challenger is lost", "launch"],
  ["01-31", 1958, "the United States launched its first satellite, Explorer 1, which discovered the radiation belts around Earth.", "Explorer 1, first US satellite", "earth"],
  ["02-01", 2003, "the Space Shuttle Columbia broke apart during re-entry, and all seven astronauts were lost.", "Columbia is lost", "earth"],
  ["02-06", 2018, "SpaceX's Falcon Heavy flew for the first time, sending a red Tesla Roadster into orbit around the Sun.", "Falcon Heavy's first flight", "launch"],
  ["02-07", 1984, "astronaut Bruce McCandless made the first untethered spacewalk, flying free of the shuttle with a jet-powered backpack.", "First untethered spacewalk", "earth"],
  ["02-11", 2010, "NASA launched the Solar Dynamics Observatory to watch the Sun around the clock.", "Solar Dynamics Observatory launches", "sun"],
  ["02-14", 1990, "Voyager 1 took the Pale Blue Dot photo, showing Earth as a speck of light from about 3.7 billion miles away.", "The Pale Blue Dot photo", "earth"],
  ["02-18", 1930, "Clyde Tombaugh discovered Pluto at Lowell Observatory in Arizona.", "Pluto is discovered", "earth"],
  ["02-18", 2021, "NASA's Perseverance rover landed in Jezero Crater on Mars, carrying a small helicopter called Ingenuity.", "Perseverance lands on Mars", "earth"],
  ["02-20", 1962, "John Glenn became the first American to orbit Earth, circling the planet three times aboard Friendship 7.", "John Glenn orbits Earth", "earth"],
  ["03-06", 2009, "NASA launched the Kepler space telescope, which went on to find thousands of planets orbiting other stars.", "Kepler telescope launches", "launch"],
  ["03-13", 1781, "astronomer William Herschel discovered Uranus, the first planet found with a telescope.", "Uranus is discovered", "earth"],
  ["03-18", 1965, "cosmonaut Alexei Leonov made the first spacewalk, floating outside his spacecraft for about 12 minutes.", "The first spacewalk", "earth"],
  ["04-10", 2019, "scientists released the first image ever taken of a black hole.", "First image of a black hole", "earth"],
  ["04-12", 1961, "Yuri Gagarin became the first human in space, orbiting Earth once in 108 minutes.", "Gagarin, first human in space", "earth"],
  ["04-12", 1981, "the Space Shuttle Columbia launched on the first shuttle mission, exactly 20 years after Gagarin's flight.", "First Space Shuttle launch", "launch"],
  ["04-13", 1970, "an oxygen tank exploded aboard Apollo 13 on the way to the Moon. The crew made it home safely four days later.", "Apollo 13's oxygen tank explodes", "moon"],
  ["04-19", 2021, "NASA's Ingenuity helicopter made the first powered flight on another planet, on Mars.", "First flight on Mars", "earth"],
  ["04-24", 1990, "the Hubble Space Telescope launched aboard the Space Shuttle Discovery.", "Hubble launches", "launch"],
  ["05-05", 1961, "Alan Shepard became the first American in space, on a 15-minute flight.", "Alan Shepard, first American in space", "launch"],
  ["05-14", 1973, "NASA launched Skylab, America's first space station.", "Skylab launches", "earth"],
  ["05-25", 1961, "President Kennedy asked Congress to commit to landing a man on the Moon before the decade was out.", "Kennedy sets the Moon goal", "moon"],
  ["05-25", 2012, "SpaceX's Dragon became the first commercial spacecraft to attach to the International Space Station.", "Dragon reaches the space station", "earth"],
  ["05-30", 2020, "SpaceX launched astronauts for the first time, sending Bob Behnken and Doug Hurley to the space station.", "SpaceX's first crew launch", "launch"],
  ["06-03", 1965, "Ed White became the first American to walk in space.", "First American spacewalk", "earth"],
  ["06-16", 1963, "Valentina Tereshkova became the first woman in space.", "First woman in space", "earth"],
  ["06-18", 1983, "Sally Ride became the first American woman in space, aboard the shuttle Challenger.", "Sally Ride flies to space", "launch"],
  ["06-21", 2004, "SpaceShipOne made the first privately funded human spaceflight.", "First private spaceflight", "launch"],
  ["06-30", 1908, "something exploded in the sky over Tunguska, Siberia, flattening about 80 million trees. It was most likely a space rock bursting in the air.", "The Tunguska blast", "asteroid"],
  ["07-04", 1997, "NASA's Mars Pathfinder bounced onto Mars, and its little rover Sojourner became the first wheeled vehicle on another planet.", "Pathfinder lands on Mars", "earth"],
  ["07-12", 2022, "NASA released the first full-color images from the James Webb Space Telescope.", "Webb's first images", "earth"],
  ["07-14", 2015, "NASA's New Horizons flew past Pluto, sending back the first close-up pictures of the dwarf planet.", "New Horizons flies past Pluto", "earth"],
  ["07-16", 1969, "Apollo 11 launched from Kennedy Space Center, headed for the first Moon landing.", "Apollo 11 launches", "launch"],
  ["07-20", 1969, "Neil Armstrong and Buzz Aldrin landed on the Moon, and Armstrong became the first person to walk on its surface.", "Apollo 11 lands on the Moon", "moon"],
  ["07-21", 2011, "the shuttle Atlantis landed for the last time, ending NASA's 30-year Space Shuttle program.", "The last shuttle landing", "earth"],
  ["08-06", 2012, "NASA's Curiosity rover was lowered onto Mars by a rocket-powered sky crane.", "Curiosity lands on Mars", "earth"],
  ["08-12", 2018, "NASA launched the Parker Solar Probe, built to fly closer to the Sun than any spacecraft before it.", "Parker Solar Probe launches", "sun"],
  ["08-20", 1977, "Voyager 2 launched. It's still the only spacecraft to visit Uranus and Neptune.", "Voyager 2 launches", "launch"],
  ["08-25", 2012, "Voyager 1 crossed into interstellar space, the first human-made object to leave the Sun's protective bubble.", "Voyager 1 reaches interstellar space", "earth"],
  ["09-05", 1977, "Voyager 1 launched. It's now the farthest human-made object from Earth.", "Voyager 1 launches", "launch"],
  ["09-12", 1962, "President Kennedy said \"we choose to go to the Moon\" in a speech at Rice University in Houston.", "\"We choose to go to the Moon\"", "moon"],
  ["09-14", 2015, "the LIGO detectors picked up gravitational waves for the first time: ripples in space itself, from two black holes colliding.", "First gravitational waves detected", "earth"],
  ["09-15", 2017, "NASA's Cassini spacecraft ended its mission by diving into Saturn, after 13 years studying the planet and its moons.", "Cassini's grand finale", "earth"],
  ["09-23", 1846, "astronomers found Neptune, right where math had predicted it would be.", "Neptune is discovered", "earth"],
  ["09-26", 2022, "NASA's DART spacecraft crashed into an asteroid on purpose, the first test of planetary defense.", "DART hits an asteroid", "asteroid"],
  ["10-01", 1958, "NASA officially opened for business.", "NASA opens for business", "launch"],
  ["10-04", 1957, "the Soviet Union launched Sputnik 1, the first artificial satellite, and the Space Age began.", "Sputnik starts the Space Age", "earth"],
  ["10-09", 2009, "NASA's LCROSS mission crashed a rocket stage into a crater near the Moon's south pole, and found water ice in the debris.", "LCROSS finds water on the Moon", "moon"],
  ["10-11", 1968, "Apollo 7 launched, the first Apollo mission with a crew.", "Apollo 7 launches", "launch"],
  ["10-20", 2020, "NASA's OSIRIS-REx briefly touched asteroid Bennu and grabbed a sample of its surface.", "OSIRIS-REx touches Bennu", "asteroid"],
  ["10-29", 1998, "John Glenn, the first American to orbit Earth, returned to space aboard the shuttle Discovery at age 77.", "John Glenn returns to space at 77", "launch"],
  ["11-02", 2000, "the first crew moved into the International Space Station, beginning decades of people living in orbit without a break.", "First crew moves into the ISS", "earth"],
  ["11-03", 1957, "the Soviet Union launched Sputnik 2, carrying a dog named Laika, the first animal to orbit Earth.", "Laika orbits Earth", "earth"],
  ["11-12", 2014, "the European Space Agency's Philae lander touched down on a comet, the first landing on one.", "Philae lands on a comet", "asteroid"],
  ["11-14", 1969, "Apollo 12 launched and was struck by lightning twice during liftoff. The crew still made it to the Moon.", "Apollo 12 struck by lightning", "launch"],
  ["11-16", 2022, "NASA's Artemis I launched on the first flight of the Space Launch System, sending an uncrewed Orion capsule around the Moon.", "Artemis I launches", "launch"],
  ["11-20", 1998, "the first piece of the International Space Station, the Russian-built Zarya module, launched.", "The ISS's first module launches", "earth"],
  ["11-26", 2018, "NASA's InSight lander touched down on Mars to listen for marsquakes.", "InSight lands on Mars", "earth"],
  ["12-02", 1993, "astronauts launched on the first mission to fix the Hubble Space Telescope's blurry vision.", "The first Hubble repair", "launch"],
  ["12-07", 1972, "Apollo 17 launched, the last Apollo mission to the Moon. That same day, the crew took the famous Blue Marble photo of Earth.", "Apollo 17 and the Blue Marble", "moon"],
  ["12-14", 1972, "the last Apollo moonwalk ended, as Gene Cernan climbed back into his lunar module.", "The last Apollo moonwalk", "moon"],
  ["12-21", 1968, "Apollo 8 launched, carrying the first humans to leave Earth orbit and travel to the Moon.", "Apollo 8 heads for the Moon", "launch"],
  ["12-21", 2015, "SpaceX landed a Falcon 9 booster back on the ground after a launch to orbit, a first for an orbital rocket.", "First orbital booster landing", "launch"],
  ["12-24", 1968, "the Apollo 8 crew took the Earthrise photo, showing Earth rising over the Moon's horizon.", "The Earthrise photo", "moon"],
  ["12-25", 2021, "the James Webb Space Telescope launched on Christmas morning.", "Webb launches", "launch"]
].map(([md, y, txt, short, bg]) => ({ md, y, txt, short, bg }));
// the anniversaries in the episode's window (3 days back to 7 ahead), closest first; up to three
function historyFor(day) {
  const t = Date.parse("2001-" + day.slice(5) + "T12:00:00Z"), dist = h => { let d = (Date.parse("2001-" + h.md + "T12:00:00Z") - t) / 864e5; if (d < -180) d += 365; if (d > 180) d -= 365; return d; };
  return HIST.map(h => ({ ...h, d: dist(h) })).filter(h => h.d >= -3 && h.d <= 7).sort((a, b) => Math.abs(a.d) - Math.abs(b.d)).slice(0, 3).sort((a, b) => a.d - b.d);
}

// this episode's deep dive and facts: rotate by week number, so every episode is different
function pickFor(day) {
  const d = new Date(day + "T12:00:00Z"), wk = Math.floor(d.getTime() / (7 * 864e5));
  const deep = DEEP[wk % DEEP.length], n = 8, start = (wk * n) % FACTS.length;
  const facts = Array.from({ length: n }, (_, i) => FACTS[(start + i) % FACTS.length]);
  return { deep, facts, sky: SKY[+d.toISOString().slice(5, 7) - 1] };
}
module.exports = { DEEP, FACTS, SKY, HIST, pickFor, historyFor };
