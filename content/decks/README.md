# Starter decks

## german-a1.csv

300 common German words for a beginner, one card each: `front,back,example,note`.
The front is the German word, nouns with their article. The back is the English.
The example is a short original German sentence. The note is the example in
English plus the plural or an irregular present form where that helps.

**How the words were chosen.** The German list from the
[FrequencyWords](https://github.com/hermitdave/FrequencyWords) project (2018,
built from OpenSubtitles) was walked in frequency order. Inflected forms were
folded into one lemma; articles, pronouns, prepositions, particles, names,
interjections and vulgarities were dropped; the first 328 content words were
kept and 28 removed by hand, mostly crime-drama vocabulary that subtitles
overweight. `build_german_a1.py` holds the list and rebuilds the CSV.

**Licence.** The FrequencyWords content is CC BY-SA 4.0, so this deck is
published under the same licence:
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Word selection derives from FrequencyWords by Hermit Dave. The English glosses
and the example sentences are original to this project.

Errors are likely at the margins. Corrections are welcome as pull requests.
