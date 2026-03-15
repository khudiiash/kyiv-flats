import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as cheerio from 'cheerio'

export interface ParsedListing {
  address?: string
  priceUsd?: number
  areaSqm?: number
  rooms?: number
  details?: string
  buildingMaterial?: string
  buildingEra?: string
  constructionYear?: number
  floor?: string 
  commission?: number
  sellerType?: string
  sellerName?: string
  appearance?: string
  infrastructure?: string[]
  photos?: string[]
  publishedAt?: string
  sourceUrl?: string
  raw?: Record<string, string>
}

export const parseListingUrl = onCall(
  { cors: true },
  async (request): Promise<ParsedListing> => {
    try {
      const url = request.data?.url as string | undefined
      if (!url || typeof url !== 'string') {
        throw new HttpsError('invalid-argument', 'URL is required')
      }

      const allowedHosts = ['dom.ria.com', 'www.dom.ria.com', 'lun.ua', 'www.lun.ua']
      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch {
        throw new HttpsError('invalid-argument', 'Invalid URL')
      }
      if (!allowedHosts.some((h) => parsedUrl.hostname === h)) {
        throw new HttpsError('invalid-argument', 'Only dom.ria.com and lun.ua links are allowed')
      }

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'uk,en;q=0.9'
        }
      })
      if (!res.ok) {
        throw new HttpsError('unavailable', `Сайт повернув ${res.status}`)
      }
      const html = await res.text()
      const $ = cheerio.load(html)

      const isDomRia = parsedUrl.hostname.includes('dom.ria')
      const result = isDomRia ? parseDomRia($, url) : parseLun($, url)

      if (result.priceUsd !== undefined && !Number.isFinite(result.priceUsd)) delete result.priceUsd
      if (result.areaSqm !== undefined && !Number.isFinite(result.areaSqm)) delete result.areaSqm
      if (result.commission !== undefined && !Number.isFinite(result.commission)) delete result.commission

      // Якщо тип не знайдено, а рік є — визначити тип по року
      if (!result.buildingEra && result.constructionYear != null) {
        const y = result.constructionYear
        if (y >= 1995) result.buildingEra = 'новобудова'
        else if (y >= 1956) result.buildingEra = 'хрущівка'
        else if (y >= 1930) result.buildingEra = 'сталінка'
        else result.buildingEra = 'хрущівка'
      }

      // Якщо стан ремонту не знайдено — визначити по типу будинку
      if (!result.appearance && result.buildingEra) {
        if (result.buildingEra === 'сталінка' || result.buildingEra === 'хрущівка') {
          result.appearance = 'радянський ремонт'
        } else if (result.buildingEra === 'новобудова') {
          result.appearance = 'євро ремонт'
        }
      }

      return result
    } catch (err) {
      if (err instanceof HttpsError) throw err
      console.error('parseListingUrl error:', err)
      throw new HttpsError('unavailable', err instanceof Error ? err.message : 'Не вдалося завантажити оголошення')
    }
  }
)

function extractRoomsFromTitle(title: string): number | undefined {
  const m =
    title.match(/(\d+)\s*кімнатн/i) ??
    title.match(/(\d+)-кімнатн/i) ??
    title.match(/(\d+)-х\s*кімнатн/i) ??
    title.match(/(\d+)[кk]\s/i) ??
    title.match(/\b(\d+)[кk]\b/i)
  if (m) {
    const n = parseInt(m[1], 10)
    return !isNaN(n) && n >= 1 && n <= 20 ? n : undefined
  }
  return undefined
}

// --- dom.ria / DIM.RIA parser ---
function parseDomRia($: cheerio.CheerioAPI, url: string): ParsedListing {
  const result: ParsedListing = { sourceUrl: url, raw: {} }

  $('meta[property], meta[name]').each((_, el) => {
    const prop = $(el).attr('property') ?? $(el).attr('name')
    const content = $(el).attr('content')
    if (prop && content) result.raw![prop] = content
  })

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() ?? '{}')
      if (json['@type'] === 'Product' || json['@type'] === 'RealEstateListing') {
        result.address ??= json.address?.streetAddress ?? json.address?.name
        result.priceUsd ??= parsePrice(json.offers?.price ?? json.price)
        result.areaSqm ??= parseFloatSafe(json.floorSize?.value ?? json.area?.value ?? '')
        const rooms = json.numberOfRooms ?? json.rooms ?? json.roomCount
        if (rooms != null) result.rooms ??= Math.round(Number(rooms)) || undefined
        const buildYear = json.constructionYear ?? json.yearBuilt ?? json.buildYear
        if (buildYear != null) result.constructionYear ??= Math.round(Number(buildYear)) || undefined
      }
    } catch { /* ignore */ }
  })

  result.address ??= result.raw!['og:street-address'] ?? result.raw!['og:locality']
  result.priceUsd ??= parsePrice(result.raw!['product:price:amount'] ?? result.raw!['og:price:amount'] ?? '')
  result.areaSqm ??= parseFloatSafe(result.raw!['product:floor_size'] ?? result.raw!['og:floor_size'] ?? '')

  const title = result.raw!['og:title'] ?? result.raw!['title'] ?? ''
  const metaDesc = result.raw!['og:description'] ?? result.raw!['description'] ?? ''
  if (title) {
    result.priceUsd ??= parsePriceFromTitle(title)
    result.address ??= extractAddressFromTitle(title)
    const areaStr = extractAreaFromTitle(title)
    if (areaStr) result.areaSqm ??= parseFloatSafe(areaStr)
    const roomsFromTitle = extractRoomsFromTitle(title)
    if (roomsFromTitle != null) result.rooms ??= roomsFromTitle
  }
  result.details ??= metaDesc || undefined

  const bodyPrice = $('.price b, .price .size30').first().text().trim()
  if (bodyPrice) result.priceUsd ??= parsePrice(bodyPrice)

  const descBlock = $('#descriptionBlock').text().trim()
  if (descBlock && descBlock.length > 10) result.details = descBlock
  else {
    const bodyDesc = $('.description.mb-24, .description.mb-24.text_primary').first().text().trim()
    if (bodyDesc && bodyDesc.length > 50) result.details ??= bodyDesc
  }

  const bodyText = $('body').text()
  const areaMatch = bodyText.match(/Загальна площа\s*([\d.]+)\s*м/i)
  if (areaMatch) result.areaSqm ??= parseFloatSafe(areaMatch[1])

  // Рік будівництва — витягуємо до ери, щоб перевірити новобудову
  const yearMatch =
    bodyText.match(/(\d{4})\s*рік\s*будівництва/i) ??
    bodyText.match(/рік\s*будівництва\s*:?\s*(\d{4})/i) ??
    bodyText.match(/збудовано\s*(\d{4})/i) ??
    bodyText.match(/побудовано\s*(\d{4})/i) ??
    bodyText.match(/(\d{4})\s*р\.?\s*буд/i) ??
    bodyText.match(/будівництво\s*(\d{4})/i)
  let parsedYear: number | undefined
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10)
    if (!isNaN(y) && y >= 1900 && y <= 2030) {
      parsedYear = y
      result.constructionYear ??= y
    }
  }

  // Ера будинку: сталінка, хрущівка — пріоритет; новобудова тільки якщо рік >= 1995
  if (/сталінк|сталинк/i.test(bodyText)) result.buildingEra ??= 'сталінка'
  else if (/хрущ[оі]вк|хрущовк/i.test(bodyText)) result.buildingEra ??= 'хрущівка'
  else if (/новобудов/i.test(bodyText) && (parsedYear == null || parsedYear >= 1995)) result.buildingEra ??= 'новобудова'

  // Матеріал будинку (цегляний, цегляному, цегла, цеглою)
  if (/цегла|цегл[оіая]?|цеглян|обкладений цеглою/i.test(bodyText)) result.buildingMaterial ??= 'цегла'
  else if (/моноліт/i.test(bodyText)) result.buildingMaterial ??= 'моноліт'
  else if (/панел/i.test(bodyText)) result.buildingMaterial ??= 'панельний'

  const floorMatch = bodyText.match(/(\d+)\s*поверх\s*з\s*(\d+)/i)
  if (floorMatch) result.floor ??= `${floorMatch[1]} з ${floorMatch[2]}`

  const roomsVal =
    bodyText.match(/(\d+)\s*кімнат[ауеи]?/i)?.[1] ??
    bodyText.match(/(\d+)-кімнатн/i)?.[1] ??
    bodyText.match(/(\d+)-х\s*кімнатн/i)?.[1] ??
    bodyText.match(/кімнат[иі]?\s*:?\s*(\d+)/i)?.[1] ??
    bodyText.match(/(\d+)[кk](?:\s|$)/i)?.[1] ??
    bodyText.match(/\b(\d+)[кk]\b/i)?.[1]
  if (roomsVal) {
    const n = parseInt(roomsVal, 10)
    if (!isNaN(n) && n >= 1 && n <= 20) result.rooms ??= n
  }

  // dom.ria: шукаємо в блоках характеристик (наприклад "1 кімната" окремим рядком)
  if (result.rooms === undefined) {
    $('[class*="characteristic"], [class*="Characteristic"], [class*="info"], [class*="params"]').each((_, el) => {
      const text = $(el).text()
      const m = text.match(/^(\d+)\s*кімнат[ауеи]?$/im) ?? text.match(/(\d+)\s*кімнат[ауеи]?/i)
      if (m) {
        const n = parseInt(m[1], 10)
        if (!isNaN(n) && n >= 1 && n <= 20) result.rooms ??= n
      }
    })
  }

  // Імʼя контактної особи: ContactsDetails_title (рядок з імʼям поруч з типом продавця)
  const sellerNameEl = $('[class*="ContactsDetails_title"]').first().text().trim()
  if (sellerNameEl && !/рієлтор|власник|верифікована/i.test(sellerNameEl)) {
    result.sellerName = sellerNameEl
  }
  // Тип продавця: спочатку з DOM (ContactsDetails_position), потім з тексту
  const sellerEl = $('[class*="ContactsDetails_position"]').first().text().trim()
  if (sellerEl) {
    if (/власник/i.test(sellerEl)) {
      result.sellerType = 'власник'
      result.commission = 0
    } else if (/рієлтор|ріелтор/i.test(sellerEl)) {
      result.sellerType = 'рієлтор'
    }
  }
  if (!result.sellerType) {
    if (/\bвласник\b|від власника|без комісії.*власник/i.test(bodyText)) {
      result.sellerType = 'власник'
      result.commission ??= 0
    } else if (/\bрієлтор\b|\bріелтор\b|від рієлтора|посередник|пропозиція від посередника|від посередника|rieltor\.ua/i.test(bodyText)) {
      result.sellerType = 'рієлтор'
    }
  }
  const commissionMatch = bodyText.match(/Комісія за послуги\s*(\d+)\s*%?/i) ?? bodyText.match(/комісія\s*(\d+)\s*%?/i)
  if (commissionMatch && result.commission === undefined) result.commission = parseFloatSafe(commissionMatch[1])
  if (/без комісії/i.test(bodyText) && result.commission === undefined) result.commission = 0

  if (/новий ремонт|євроремонт|дизайнерський ремонт/i.test(bodyText)) result.appearance ??= 'євро'
  else if (/косметичний ремонт|нормальний/i.test(bodyText)) result.appearance ??= 'нормальний'
  else if (/потребує ремонту|без ремонту|старий ремонт/i.test(bodyText)) result.appearance ??= 'відсутній'
  else if (/радянськ|хрущовк/i.test(bodyText)) result.appearance ??= 'радянський'

  const infra: string[] = []
  if (/метро|м\s+[А-Яа-яіїєґІЇЄҐ]+/i.test(bodyText)) infra.push('метро')
  if (/торговий центр|тц|торгово-розваж/i.test(bodyText)) infra.push('тц')
  if (/розваг|кіно|ресторан|кафе/i.test(bodyText)) infra.push('розваги')
  if (/парк|сквер|відпочинок|дитячий майданчик|спорт/i.test(bodyText)) infra.push('відпочинок')
  if (/школа|садок|університет|ліцей/i.test(bodyText)) infra.push('школа')
  if (infra.length > 0) result.infrastructure ??= infra

  const photoUrls: string[] = []
  const seenIds = new Set<string>()
  const seenUrls = new Set<string>()
  const addPhoto = (src: string) => {
    if (!src || src.length < 20 || !/riastatic\.com/i.test(src)) return
    const fullUrl = src.startsWith('//') ? 'https:' + src : src
    if (seenUrls.has(fullUrl)) return
    const id = fullUrl.match(/_(\d+)(?:[xX][a-zA-Z0-9]*)?\./)?.[1] ?? fullUrl.match(/\/(\d{6,})/)?.[1] ?? fullUrl
    if (seenIds.has(id)) return
    seenIds.add(id)
    seenUrls.add(fullUrl)
    photoUrls.push(resizeImageUrl(fullUrl))
  }
  $('picture img[src], .withSlides img[src], [id^="slidePhoto"] img[src]').each((_, el) => {
    addPhoto($(el).attr('src') ?? '')
  })
  if (photoUrls.length === 0 && result.raw!['og:image']) {
    const og = result.raw!['og:image']
    if (og) photoUrls.push(resizeImageUrl(og.startsWith('//') ? 'https:' + og : og))
  }
  if (photoUrls.length > 0) result.photos = photoUrls.slice(0, 20)

  const pubMatch = bodyText.match(/Оголошення\s+створене\s+(\d+)\s+([а-яіїєґ]+)\.?\s*(\d{4})/i)
  if (pubMatch) result.publishedAt = parsePublishedDate(pubMatch[1], pubMatch[2], pubMatch[3])

  return result
}

// --- LUN.ua parser ---
function parseLun($: cheerio.CheerioAPI, url: string): ParsedListing {
  const result: ParsedListing = { sourceUrl: url, raw: {} }

  $('script#__NEXT_DATA__').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? '{}')
      const listing = data.props?.pageProps?.listing ?? data.props?.pageProps?.offer ?? data.props?.pageProps?.listingData
      if (listing) {
        result.address ??= listing.address ?? listing.street ?? listing.fullAddress
        result.priceUsd ??= parsePrice(listing.priceUsd ?? listing.price ?? listing.priceUSD)
        result.areaSqm ??= parseFloatSafe(listing.area ?? listing.totalArea ?? listing.areaSqm)
        const lunRooms =
          listing.rooms ??
          listing.roomsCount ??
          listing.roomCount ??
          listing.numberOfRooms ??
          listing.room_count ??
          listing.rooms_count ??
          listing.features?.rooms ??
          listing.params?.rooms ??
          listing.characteristics?.rooms
        if (lunRooms != null) result.rooms ??= Math.round(Number(lunRooms)) || undefined
        result.floor ??= listing.floor ? `${listing.floor} з ${listing.floorsTotal ?? ''}`.replace(/ з $/, '') : undefined
        result.details ??= listing.description ?? listing.text
        result.buildingMaterial ??= mapLunBuildingType(listing.wallType ?? listing.buildingType)
        const buildYear =
          listing.constructionYear ??
          listing.yearBuilt ??
          listing.buildYear ??
          (listing as Record<string, unknown>).year
        const yearNum = buildYear != null ? Math.round(Number(buildYear)) : undefined
        if (yearNum != null && yearNum >= 1900 && yearNum <= 2030) result.constructionYear ??= yearNum
        const lunEra = mapLunBuildingCategory(listing.buildingCategory ?? listing.buildingType ?? listing.type)
        if (lunEra && (lunEra !== 'новобудова' || yearNum == null || yearNum >= 1995)) result.buildingEra ??= lunEra
        result.appearance ??= mapLunAppearance(listing.renovation ?? listing.state)
        const lunSeller = String(listing.sellerType ?? listing.owner ?? listing.source ?? '').toLowerCase()
        if (/власник|owner/i.test(lunSeller)) {
          result.sellerType ??= 'власник'
          result.commission ??= 0
        } else if (/рієлтор|realtor|посередник/i.test(lunSeller)) {
          result.sellerType ??= 'рієлтор'
        }
        if (result.commission === undefined) result.commission = parseFloatSafe(listing.commission)
        result.sellerName ??= listing.sellerName ?? listing.ownerName ?? listing.contactName ?? listing.author
        if (listing.photos?.length) {
          result.photos = listing.photos
            .slice(0, 20)
            .map((p: { url?: string; src?: string; originalUrl?: string; fullUrl?: string }) =>
              p?.originalUrl ?? p?.fullUrl ?? p?.url ?? p?.src
            )
            .filter(Boolean)
            .map((u: string) => resizeImageUrl(u))
        }
      }
    } catch { /* ignore */ }
  })

  $('meta[property], meta[name]').each((_, el) => {
    const prop = $(el).attr('property') ?? $(el).attr('name')
    const content = $(el).attr('content')
    if (prop && content) result.raw![prop] = content
  })

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() ?? '{}')
      if (json['@type'] === 'Product' || json['@type'] === 'RealEstateListing') {
        result.address ??= json.address?.streetAddress ?? json.address?.name
        result.priceUsd ??= parsePrice(json.offers?.price ?? json.price)
        result.areaSqm ??= parseFloatSafe(json.floorSize?.value ?? json.area?.value ?? '')
        const rooms = json.numberOfRooms ?? json.rooms ?? json.roomCount
        if (rooms != null) result.rooms ??= Math.round(Number(rooms)) || undefined
        const buildYear = json.constructionYear ?? json.yearBuilt ?? json.buildYear
        if (buildYear != null) result.constructionYear ??= Math.round(Number(buildYear)) || undefined
      }
    } catch { /* ignore */ }
  })

  result.address ??= result.raw!['og:street-address'] ?? result.raw!['og:locality']
  result.priceUsd ??= parsePrice(result.raw!['product:price:amount'] ?? result.raw!['og:price:amount'] ?? '')
  result.areaSqm ??= parseFloatSafe(result.raw!['product:floor_size'] ?? result.raw!['og:floor_size'] ?? '')

  const title = result.raw!['og:title'] ?? result.raw!['title'] ?? ''
  if (title) {
    result.priceUsd ??= parsePriceFromTitle(title)
    result.address ??= extractAddressFromTitle(title)
    const areaStr = extractAreaFromTitle(title)
    if (areaStr) result.areaSqm ??= parseFloatSafe(areaStr)
    const roomsFromTitle = extractRoomsFromTitle(title)
    if (roomsFromTitle != null) result.rooms ??= roomsFromTitle
  }
  result.details ??= result.raw!['og:description'] ?? result.raw!['description'] ?? undefined

  const expandableDesc = $('[class*="ExpandableText_text"]').first().text().trim()
  if (expandableDesc && expandableDesc.length > 20) result.details = expandableDesc

  const bodyText = $('body').text()

  const lunAreaMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*\/\s*[\d.]+.*м²|(\d+(?:\.\d+)?)\s*м²/i)
  if (lunAreaMatch) result.areaSqm ??= parseFloatSafe(lunAreaMatch[1] ?? lunAreaMatch[2])

  const lunPriceMatch = bodyText.match(/\$\s*([\d\s]+)|([\d\s]+)\s*\$/)
  if (lunPriceMatch) result.priceUsd ??= parsePrice(lunPriceMatch[1] ?? lunPriceMatch[2])

  const lunAddrMatch = bodyText.match(/(?:вулиця|вул\.?)\s+([^,\n]+(?:,\s*\d+[А-Яа-яіїєґ]*)?)/i)
  if (lunAddrMatch && !result.address) result.address = lunAddrMatch[1].trim()

  const areaMatch = bodyText.match(/Загальна площа\s*([\d.]+)\s*м/i)
  if (areaMatch) result.areaSqm ??= parseFloatSafe(areaMatch[1])

  const yearMatch =
    bodyText.match(/(\d{4})\s*рік\s*будівництва/i) ??
    bodyText.match(/рік\s*будівництва\s*:?\s*(\d{4})/i) ??
    bodyText.match(/збудовано\s*(\d{4})/i) ??
    bodyText.match(/побудовано\s*(\d{4})/i) ??
    bodyText.match(/(\d{4})\s*р\.?\s*буд/i) ??
    bodyText.match(/будівництво\s*(\d{4})/i)
  if (yearMatch && result.constructionYear === undefined) {
    const y = parseInt(yearMatch[1], 10)
    if (!isNaN(y) && y >= 1900 && y <= 2030) result.constructionYear = y
  }
  const yearForEra = result.constructionYear

  if (/сталінк|сталинк/i.test(bodyText)) result.buildingEra ??= 'сталінка'
  else if (/хрущ[оі]вк|хрущовк/i.test(bodyText)) result.buildingEra ??= 'хрущівка'
  else if (/новобудов/i.test(bodyText) && (yearForEra == null || yearForEra >= 1995)) result.buildingEra ??= 'новобудова'

  if (/цегла|цегл[оіая]?|цеглян|обкладений цеглою/i.test(bodyText)) result.buildingMaterial ??= 'цегла'
  else if (/моноліт|каркас/i.test(bodyText)) result.buildingMaterial ??= 'моноліт'
  else if (/панел/i.test(bodyText)) result.buildingMaterial ??= 'панельний'

  const floorMatch = bodyText.match(/(\d+)\s*поверх\s*з\s*(\d+)/i) ?? bodyText.match(/поверх\s*(\d+)\s*з\s*(\d+)/i)
  if (floorMatch) result.floor ??= `${floorMatch[1]} з ${floorMatch[2]}`

  const roomsVal =
    bodyText.match(/(\d+)\s*кімнат[ауеи]?/i)?.[1] ??
    bodyText.match(/(\d+)-кімнатн/i)?.[1] ??
    bodyText.match(/(\d+)-х\s*кімнатн/i)?.[1] ??
    bodyText.match(/кімнат[иі]?\s*:?\s*(\d+)/i)?.[1] ??
    bodyText.match(/(\d+)[кk](?:\s|$)/i)?.[1] ??
    bodyText.match(/\b(\d+)[кk]\b/i)?.[1]
  if (roomsVal && result.rooms === undefined) {
    const n = parseInt(roomsVal, 10)
    if (!isNaN(n) && n >= 1 && n <= 20) result.rooms = n
  }

  // lun.ua: шукаємо в блоках з характеристиками
  if (result.rooms === undefined) {
    $('[class*="room"], [class*="Room"], [class*="characteristic"], [class*="info"]').each((_, el) => {
      const text = $(el).text()
      const m = text.match(/^(\d+)\s*кімнат[ауеи]?$/im) ?? text.match(/(\d+)\s*кімнат[ауеи]?/i)
      if (m) {
        const n = parseInt(m[1], 10)
        if (!isNaN(n) && n >= 1 && n <= 20) result.rooms ??= n
      }
    })
  }

  // Імʼя контактної особи: ContactsDetails_title (рядок з імʼям поруч з типом продавця)
  const sellerNameEl = $('[class*="ContactsDetails_title"]').first().text().trim()
  if (sellerNameEl && !/рієлтор|власник|верифікована/i.test(sellerNameEl)) {
    result.sellerName = sellerNameEl
  }
  // Тип продавця: спочатку з DOM (ContactsDetails_position), потім з тексту
  const sellerEl = $('[class*="ContactsDetails_position"]').first().text().trim()
  if (sellerEl) {
    if (/власник/i.test(sellerEl)) {
      result.sellerType = 'власник'
      result.commission = 0
    } else if (/рієлтор|ріелтор/i.test(sellerEl)) {
      result.sellerType = 'рієлтор'
    }
  }
  if (!result.sellerType) {
    if (/\bвласник\b|від власника|без комісії.*власник/i.test(bodyText)) {
      result.sellerType = 'власник'
      result.commission ??= 0
    } else if (/\bрієлтор\b|\bріелтор\b|від рієлтора|посередник|пропозиція від посередника|від посередника|rieltor\.ua/i.test(bodyText)) {
      result.sellerType = 'рієлтор'
    }
  }
  const commissionMatch = bodyText.match(/Комісія за послуги\s*(\d+)\s*%?/i) ?? bodyText.match(/комісія\s*(\d+)\s*%?/i)
  if (commissionMatch && result.commission === undefined) result.commission = parseFloatSafe(commissionMatch[1])
  if (/без комісії/i.test(bodyText) && result.commission === undefined) result.commission = 0

  if (/новий ремонт|євроремонт|дизайнерський ремонт|з ремонтом/i.test(bodyText)) result.appearance ??= 'євро ремонт'
  else if (/косметичний ремонт|нормальний/i.test(bodyText)) result.appearance ??= 'нормальний ремонт'
  else if (/потребує ремонту|без ремонту|старий ремонт/i.test(bodyText)) result.appearance ??= 'без ремонту'
  else if (/радянськ|хрущовк|сталінка/i.test(bodyText)) result.appearance ??= 'радянський ремонт'

  const infra: string[] = []
  if (/метро|м\s+[А-Яа-яіїєґІЇЄҐ]+/i.test(bodyText)) infra.push('метро')
  if (/торговий центр|тц|торгово-розваж/i.test(bodyText)) infra.push('тц')
  if (/розваг|кіно|ресторан|кафе/i.test(bodyText)) infra.push('розваги')
  if (/парк|сквер|відпочинок|дитячий майданчик|спорт/i.test(bodyText)) infra.push('відпочинок')
  if (/школа|садок|університет|ліцей/i.test(bodyText)) infra.push('школа')
  if (infra.length > 0) result.infrastructure ??= infra

  if (!result.photos?.length) {
    const photoUrls: string[] = []
    const seenIds = new Set<string>()
    const seenUrls = new Set<string>()
    const addPhoto = (src: string) => {
      if (!src || src.length < 20) return
      const fullUrl = src.startsWith('//') ? 'https:' + src : src
      if (!/lun\.ua|cdn\.|cloudfront|amazonaws|storage\.|\.(jpg|jpeg|png|webp)(\?|$)/i.test(fullUrl)) return
      if (seenUrls.has(fullUrl)) return
      const id = fullUrl.match(/_(\d+)(?:[xX][a-zA-Z0-9]*)?\./)?.[1] ?? fullUrl.match(/\/(\d{6,})/)?.[1] ?? fullUrl
      if (seenIds.has(id)) return
      seenIds.add(id)
      seenUrls.add(fullUrl)
      photoUrls.push(resizeImageUrl(fullUrl))
    }
    $('picture img[src], img[src*="photo"], img[src*="image"], img[src*="gallery"]').each((_, el) => {
      addPhoto($(el).attr('src') ?? '')
    })
    if (photoUrls.length === 0 && result.raw!['og:image']) {
      const og = result.raw!['og:image']
      if (og) photoUrls.push(resizeImageUrl(og.startsWith('//') ? 'https:' + og : og))
    }
    if (photoUrls.length > 0) result.photos = photoUrls.slice(0, 20)
  }

  const pubMatch = bodyText.match(/Оголошення\s+створене\s+(\d+)\s+([а-яіїєґ]+)\.?\s*(\d{4})/i)
  if (pubMatch) result.publishedAt = parsePublishedDate(pubMatch[1], pubMatch[2], pubMatch[3])
  else {
    const lunPubMatch = bodyText.match(/знайдено\s+(\d+)\s+([а-яіїєґ]+)\.?\s*(\d{4})/i)
    if (lunPubMatch) result.publishedAt = parsePublishedDate(lunPubMatch[1], lunPubMatch[2], lunPubMatch[3])
  }

  return result
}

// --- shared helpers ---
const MAX_DIM = 2000

/** Scale dimensions up if too small, keep aspect ratio, cap at 2000px. */
function scaleDimensions(w: number, h: number): { w: number; h: number } | null {
  if (w <= 0 || h <= 0) return null
  const maxSide = Math.max(w, h)
  if (maxSide >= MAX_DIM) return null // already big enough, don't touch
  const scale = MAX_DIM / maxSide
  const newW = Math.min(Math.round(w * scale), MAX_DIM)
  const newH = Math.min(Math.round(h * scale), MAX_DIM)
  return { w: newW, h: newH }
}

/** Increase image dimensions in URL if too small; preserve aspect ratio, cap at 2k. */
function resizeImageUrl(url: string): string {
  if (!url || url.length < 10) return url
  let out = url

  // lunstatic.net: /lun-ua/220/220/images/ or /560/995/images/
  const lunMatch = out.match(/\/(\d+)\/(\d+)\/images\//)
  if (lunMatch) {
    const w = parseInt(lunMatch[1], 10)
    const h = parseInt(lunMatch[2], 10)
    const scaled = scaleDimensions(w, h)
    if (scaled) {
      out = out.replace(/\/(\d+)\/(\d+)\/images\//, `/${scaled.w}/${scaled.h}/images/`)
    }
  }

  // riastatic/dom.ria: _640x480.webp
  const wxhMatch = out.match(/_(\d+)x(\d+)(\.[a-zA-Z0-9]+)(\?|$)/)
  if (wxhMatch) {
    const w = parseInt(wxhMatch[1], 10)
    const h = parseInt(wxhMatch[2], 10)
    const scaled = scaleDimensions(w, h)
    if (scaled) {
      out = out.replace(/_(\d+)x(\d+)(\.[a-zA-Z0-9]+)(\?|$)/, `_${scaled.w}x${scaled.h}$3$4`)
    }
  }

  // /640x480/ in path
  const pathMatch = out.match(/\/(\d+)x(\d+)\//)
  if (pathMatch) {
    const w = parseInt(pathMatch[1], 10)
    const h = parseInt(pathMatch[2], 10)
    const scaled = scaleDimensions(w, h)
    if (scaled) {
      out = out.replace(/\/(\d+)x(\d+)\//, `/${scaled.w}x${scaled.h}/`)
    }
  }

  // ?w=640 or ?width=640 — only scale up if small
  out = out.replace(/([?&])(w|width)=(\d+)/gi, (_, sep, key, val) => {
    const n = parseInt(val, 10)
    return n > 0 && n < MAX_DIM ? `${sep}${key}=${MAX_DIM}` : `${sep}${key}=${val}`
  })

  return out
}

function parsePrice(val: string | number): number | undefined {
  if (typeof val === 'number') return Number.isFinite(val) ? val : undefined
  const num = parseFloat(String(val).replace(/[^\d.]/g, ''))
  return isNaN(num) ? undefined : num
}

function parseFloatSafe(val: string | number): number | undefined {
  const num = typeof val === 'number' ? val : parseFloat(String(val))
  return Number.isFinite(num) ? num : undefined
}

function parsePriceFromTitle(title: string): number | undefined {
  const match = title.match(/ціна:\s*([\d\s]+)\s*доларів/i) ?? title.match(/([\d\s]+)\s*\$/)
  return match ? parsePrice(match[1]) : undefined
}

function extractAddressFromTitle(title: string): string | undefined {
  const m = title.match(/квартиру[,\s]+(.+?)(?:,\s*вторинне|\s*ціна:)/i)
  if (m) return m[1].trim()
  const m2 = title.match(/(?:на|за адресою)\s+([^,]+(?:,\s*[^,]+)*)/i)
  return m2 ? m2[1].trim() : undefined
}

function extractAreaFromTitle(title: string): string | undefined {
  const m = title.match(/([\d.]+)\s*(?:кв\.?\s*м|м²)/i)
  return m ? m[1] : undefined
}

function mapLunBuildingType(val: string | undefined): string | undefined {
  if (!val) return undefined
  const v = val.toLowerCase()
  if (/цегла|цегл|цеглян|кирпич/i.test(v)) return 'цегла'
  if (/моноліт|монолит|каркас/i.test(v)) return 'моноліт'
  if (/панел/i.test(v)) return 'панельний'
  return undefined
}

function mapLunBuildingCategory(val: string | undefined): string | undefined {
  if (!val) return undefined
  const v = val.toLowerCase()
  if (/новобудов|new.?build|новострой/i.test(v)) return 'новобудова'
  if (/хрущ[оі]вк|хрущовк|khrushch/i.test(v)) return 'хрущівка'
  if (/сталінк|сталинк|stalin/i.test(v)) return 'сталінка'
  return undefined
}

function mapLunAppearance(val: string | undefined): string | undefined {
  if (!val) return undefined
  const v = val.toLowerCase()
  if (/євро|евро|з ремонтом|ремонт|дизайн/i.test(v)) return 'євро ремонт'
  if (/косметич|нормаль/i.test(v)) return 'нормальний ремонт'
  if (/без ремонту|потребує|відсутн/i.test(v)) return 'без ремонту'
  if (/радян|хрущ|сталін/i.test(v)) return 'радянський ремонт'
  return undefined
}

const UA_MONTHS: Record<string, number> = {
  січ: 1, лют: 2, бер: 3, бере: 3, кві: 4, тра: 5, трав: 5, чер: 6, лип: 7,
  сер: 8, вер: 9, жов: 10, лис: 11, лист: 11, гру: 12
}

function parsePublishedDate(day: string, monthAbbr: string, year: string): string {
  const key = monthAbbr.toLowerCase().replace(/\./g, '').slice(0, 4)
  const m = UA_MONTHS[key.slice(0, 3)] ?? UA_MONTHS[key]
  if (!m) return `${day}.${monthAbbr}.${year}`
  const mm = String(m).padStart(2, '0')
  const dd = String(parseInt(day, 10)).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}
