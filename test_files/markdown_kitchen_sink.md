# Markdown Kitchen Sink

Этот файл нужен для ручного и автоматического тестирования рендера, парсинга, сохранения, round-trip между Source/Visual и поведения редактора на смешанном контенте.

---

## Оглавление

1. [Заголовки](#заголовки)
2. [Параграфы и переносы](#параграфы-и-переносы)
3. [Текстовые выделения](#текстовые-выделения)
4. [Списки](#списки)
5. [Цитаты](#цитаты)
6. [Код](#код)
7. [Ссылки и изображения](#ссылки-и-изображения)
8. [Таблицы](#таблицы)
9. [Задачи](#задачи)
10. [HTML](#html)
11. [Сложные комбинации](#сложные-комбинации)
12. [Экранирование](#экранирование)
13. [Сноски](#сноски)
14. [Якоря и финал](#якоря-и-финал)

---

## Заголовки

# H1
## H2
### H3
#### H4
##### H5
###### H6

Alt H1
======

Alt H2
------

## Параграфы и переносы

Обычный параграф с кириллицей, Latin text, цифрами `1234567890` и символами `~!@#$%^&*()_+-=[]{}|;:',.<>/?`.

Следующая строка идет сразу после предыдущей и должна остаться в том же параграфе.
А эта строка тоже в том же параграфе.

Здесь принудительный перенос строки в конце строки.  
Новая строка после двух пробелов.

Ниже пустая строка, поэтому это уже новый параграф.

Очень длинная строка для проверки переноса текста внутри редактора и визуального режима: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua, утка кот собака редактор markdown visual source filesystem workspace split pane round trip.

## Текстовые выделения

*Курсив через звездочки*

_Курсив через подчеркивания_

**Жирный через звездочки**

__Жирный через подчеркивания__

***Жирный курсив***

~~Зачеркнутый текст~~

<u>Подчеркнутый HTML-текст</u>

==Это не стандартный Markdown, но полезно проверить как ведет себя редактор с двойным равно==.

Смешанный текст: **жирный _внутри курсив_ и `inline code` рядом** с обычным текстом.

Нижний^индекс^ и H~2~O как нестандартные конструкции, чтобы проверить сохранность исходника.

## Списки

### Маркированный список

- Первый пункт
- Второй пункт
- Третий пункт с вложением
  - Вложенный пункт 1
  - Вложенный пункт 2
    - Глубже уровень 3
      - Глубже уровень 4
- Пункт с несколькими параграфами

  Второй параграф внутри пункта списка.

  И еще один абзац внутри того же пункта.

- Пункт с кодом

  ```ts
  const list = ["one", "two", "three"];
  console.log(list.join(", "));
  ```

### Нумерованный список

1. Первый
2. Второй
3. Третий
   1. Вложенный первый
   2. Вложенный второй
4. Четвертый

### Смешанный список

1. Нумерованный верхний уровень
   - Вложенный маркированный
   - Еще один вложенный
2. Второй верхний уровень
   - [x] Чекбокс внутри списка
   - [ ] Пустой чекбокс внутри списка

## Цитаты

> Простая цитата.

> Многострочная цитата
> со второй строкой
> и третьей строкой.

> Вложенная структура:
>
> - список внутри цитаты
> - второй пункт
>
> > вложенная цитата второго уровня
> >
> > 1. и даже список
> > 2. прямо внутри нее

## Код

Инлайн-код: `const answer = 42`

```txt
Простой fenced code block без подсветки.
Вторая строка.
Третья строка.
```

```js
function greet(name) {
  return `Hello, ${name}!`;
}

console.log(greet("Folden"));
```

```ts
type User = {
  id: string;
  name: string;
  roles: string[];
};

const user: User = {
  id: "u-1",
  name: "Макс",
  roles: ["admin", "writer"],
};
```

```json
{
  "name": "Folden",
  "version": "0.4.3",
  "features": ["visual", "source", "workspace"]
}
```

```html
<section class="card">
  <h2>HTML Block</h2>
  <p>Paragraph inside raw HTML.</p>
</section>
```

```css
:root {
  --bg: #101418;
  --fg: #f3f5f7;
}
```

```bash
npm run vue:dev
npm run app:dev
```

```diff
- old line
+ new line
 unchanged line
```

Табуляция и отступы в коде:

    line one
        line two
            line three

Фенс с тильдами:

~~~md
## Заголовок внутри fenced-блока

- Это не должно парситься как реальный список
~~~

Фенс с внутренними бэктиками:

````
```md
inner fenced block example
```
````

## Ссылки и изображения

[Обычная ссылка](https://example.com)

[Ссылка с title](https://example.com "Example Title")

<https://example.org/autolink>

<email@example.com>

[Относительная ссылка на соседний файл](./test.md)

[Относительная ссылка с пробелами в пути](./workspace%201/test%201.md)

[Ссылка на заголовок в этом файле](#таблицы)

[Reference link][ref-main]

[Reference link с title][ref-title]

[Broken external link](https://this-domain-should-probably-not-exist-123456789.example)

![Local image relative](./test.png)

![Local image plain](test.png)

![Remote image](https://placehold.co/640x240/png)

![Remote broken image](https://pladfghfdhgdcehold.codfg/600x400)

![Data URI image](data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><rect width='120' height='40' fill='black'/><text x='10' y='25' fill='white'>inline</text></svg>)

[ref-main]: https://example.net/path?query=1&lang=ru
[ref-title]: https://example.net/with-title "Reference Title"

## Таблицы

| Колонка A | Колонка B | Колонка C |
| --- | --- | --- |
| Текст | `code` | [link](https://example.com) |
| **bold** | *italic* | ~~strike~~ |
| длинный текст | строка 2 | строка 3 |

| Left | Center | Right |
| :--- | :---: | ---: |
| 1 | 2 | 3 |
| a | b | c |

## Задачи

- [x] Поддержка обычных чекбоксов
- [ ] Поддержка пустых чекбоксов
- [x] Проверка round-trip без лишних изменений
  - [x] Вложенный отмеченный
  - [ ] Вложенный пустой

## HTML

<details>
  <summary>Раскрывающийся блок summary/details</summary>

  <p>Параграф внутри HTML-блока.</p>

  <ul>
    <li>HTML list item</li>
    <li>Еще один пункт</li>
  </ul>
</details>

<table>
  <tr>
    <th>HTML Table A</th>
    <th>HTML Table B</th>
  </tr>
  <tr>
    <td>Cell 1</td>
    <td>Cell 2</td>
  </tr>
</table>

<blockquote>
  HTML blockquote внутри raw HTML.
</blockquote>

<div class="warning" data-test-id="raw-html-block">
  <strong>Raw HTML:</strong> полезно для проверки санитайзера и сохранения исходника.
</div>

<br>
<hr>

## Сложные комбинации

> Цитата со списком и кодом:
>
> 1. Первый шаг
> 2. Второй шаг
>
>    ```python
>    def add(a, b):
>        return a + b
>    ```
>
> Завершающий текст цитаты.

1. Нумерованный список с таблицей ниже:

   | Key | Value |
   | --- | --- |
   | one | 1 |
   | two | 2 |

2. После таблицы идет обычный текст того же пункта.

- Пункт списка с цитатой:

  > Вложенная цитата внутри пункта списка.

- Пункт списка с HTML:

  <details>
    <summary>Mini details</summary>
    <p>HTML внутри списка.</p>
  </details>

## Экранирование

\*Это не курсив\*

\# Это не заголовок

\[Это не ссылка](https://example.com)

\`Это не inline code\`

Символы с HTML entities: &copy; &amp; &lt;div&gt; &nbsp;

Путь с backslash: `C:\Documents\Notes\example.md`

JSON-like text без fenced блока: {"a":1,"b":[true,false,null]}

## Сноски

Текст со сноской.[^1]

Еще одна сноска со ссылкой и форматированием.[^long-note]

[^1]: Короткая сноска.

[^long-note]: Длинная сноска с **жирным**, `code`, [link](https://example.com) и несколькими строками.
    Продолжение той же сноски на следующей строке.

## Якоря и финал

### Секция для якоря {#custom-anchor-like-text}

Если редактор не поддерживает часть синтаксиса нативно, он все равно не должен неожиданно ломать или сильно переписывать исходник без явного действия пользователя.

---

Конец файла.
