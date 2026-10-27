# List format

One item per line. Plain text, so you can type it, paste it from a note, or have Gemini convert your usual list.

```
<what to buy> ; <how much> ; <note>
```

| Part | Required | Meaning |
|---|---|---|
| what to buy | yes | The words to search for. Use the name a grocery site uses (`Poha`, `Jeera`, `Pressure cooker 5 L`). A brand narrows it (`Aashirvaad atta`). A size **here** describes each piece (`Container 1 kg` is a 1 kg container), not how many to buy. |
| how much | no | `x6` = 6 pieces or packs. `5 kg`, `500 g`, `2 L`, `200 ml` = the total amount; the tool picks packs that add up to it, preferring a single pack of that size (5 kg → one 5 kg pack, else 2 × 2.5 kg …). Left out = `x1`. |
| note | no | Shown next to the item while reviewing, never searched. Good for the Hindi name or a reminder (`चावल`, `any brand`). |

Rules:
- Blank lines are ignored. A line starting with `#` is a comment and ignored.
- Units: `g`, `kg`, `ml`, `L` (case doesn't matter; `gm`, `gms`, `ltr`, `litre` are accepted too). A weight and a volume
  are treated as equal for liquids sold by weight or volume (oil `5 kg` ≈ `5 L`).
- One thing per line: "6 medium + 6 small bowls" is two lines.
- Spaces around `;` don't matter. Don't use `;` inside the name.

## Example (your list, converted)
[`examples/my-list.txt`](examples/my-list.txt) is the list you shared, in this format. Excerpt:

```
Tea strainer ; x1 ; चाय छन्नी
Pressure cooker 5 L ; x1 ; प्रेशर कुकर
Bowl medium ; x6 ; कटोरा
Bowl small ; x6 ; कटोरा
Steel container 5 kg ; x3 ; डब्बा
Container 1 kg ; x6 ; डब्बा
Rice ; 5 kg ; चावल
Mustard oil ; 5 L ; सरसों तेल
Jeera ; 100 g ; जीरा
Tej patta ; x1 ; तेजपत्ता
Dustbin large ; x1
Dustbin ; x2
```

## Gemini prompt
Save this as a Gem (or paste it before your list). It turns your usual list into this format.

````
You convert my shopping lists into a strict line format for a shopping tool. Reply with ONLY one fenced code block containing the converted lines, then a short "Check these:" list of anything you had to guess. No other text.

FORMAT, one item per line:
<what to buy> ; <how much> ; <note>

1. <what to buy>: the product name as Indian grocery websites (JioMart, BigBasket) list it, in English letters. Use ONE name, the one shops use most, not a translation pair. Prefer the common Hindi-English shop name for staples and spices (Atta, Suji, Poha, Jeera, Ajwain, Saunf, Tej patta, Kasuri methi, Masoor dal, Phool jhadu), and plain English for utensils and household items (Tea strainer, Rolling pin, Dish drying basket). Keep any brand I wrote. Keep a size or material that describes each piece (Pressure cooker 5 L, Steel container 5 kg, Copper mug). Add a word only if the name alone would find the wrong thing (Bay leaves → Tej patta; Induction → Induction cooktop; Matchbox stays Matchbox). Never add a brand, material or colour I didn't write.
2. <how much>:
   - a count of pieces or packs → x<N>   (Tea cup – 6 → x6)
   - a total weight or volume to buy → <number> <unit> with unit g, kg, ml or L   (Rice – 5 kg → 5 kg)
   - nothing given → x1
   - Oils, ghee and other liquids written in kg → the same number in L (Mustard oil 5 kg → 5 L).
   - A number next to a container, cooker, mug or similar is its size, which goes in <what to buy>, and the count goes here (Containers 1 kg – 6 → Container 1 kg ; x6).
3. <note>: the original Devanagari name if I wrote one, plus anything that matters but must not be searched (with lid, M + S). Leave it out if there is nothing.
4. Split combined items into separate lines: "Bowls – 6 × 2 (M + S)" → "Bowl medium ; x6" and "Bowl small ; x6". "Dustbin – 3 (1 Large + 2 Normal)" → "Dustbin large ; x1" and "Dustbin ; x2". "Patila – 2 (with lid)" → "Patila with lid ; x2".
5. Drop section headings, numbering, bullets and dashes. Never use ";" inside a name. Keep my order.

EXAMPLE
Input:
Kitchen
 * चाय छन्नी (Tea Strainer) – 1
 * डब्बा (Containers) 5 kg – 3 (Steel)
 * कटोरा (Bowls) – 6 × 2 (M + S)
Groceries
 * चावल (Rice) – 5 kg
 * सरसों तेल (Mustard Oil) – 5 kg
 * तेजपत्ता (Bay Leaves)
Output:
```
Tea strainer ; x1 ; चाय छन्नी
Steel container 5 kg ; x3 ; डब्बा
Bowl medium ; x6 ; कटोरा
Bowl small ; x6 ; कटोरा
Rice ; 5 kg ; चावल
Mustard oil ; 5 L ; सरसों तेल
Tej patta ; x1 ; तेजपत्ता
```

Convert this list:
````
