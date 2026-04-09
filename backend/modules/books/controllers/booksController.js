export class BooksController {
  constructor({ booksService }) {
    this.booksService = booksService;

    this.getBooks = this.getBooks.bind(this);
    this.getLibraryFeed = this.getLibraryFeed.bind(this);
    this.searchBooks = this.searchBooks.bind(this);
    this.getBookById = this.getBookById.bind(this);
    this.readBook = this.readBook.bind(this);
    this.getGutenbergPreview = this.getGutenbergPreview.bind(this);
    this.readGutenbergBook = this.readGutenbergBook.bind(this);
    this.readBookBySource = this.readBookBySource.bind(this);
  }

  async getBooks(_req, res) {
    try {
      const payload = await this.booksService.getBooks();
      return res.json(payload);
    } catch (error) {
      return this.handleError(error, res, 'Server error fetching books.');
    }
  }

  async getLibraryFeed(req, res) {
    try {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Surrogate-Control': 'no-store',
      });

      const payload = await this.booksService.getLibraryFeed({ userId: req.user?._id });
      return res.json(payload);
    } catch {
      return res.json({ books: [], personalized: false, deprecated: true });
    }
  }

  async searchBooks(req, res) {
    try {
      const payload = await this.booksService.searchBooks({ query: req.query });
      return res.json(payload);
    } catch (error) {
      return this.handleError(error, res, 'Server error searching Gutenberg books.');
    }
  }

  async getBookById(req, res) {
    try {
      const payload = await this.booksService.getBookById({ id: req.params.id });
      return res.json(payload);
    } catch (error) {
      return this.handleError(error, res, 'Server error fetching book');
    }
  }

  async readBook(req, res) {
    try {
      const payload = await this.booksService.readBookById({ id: req.params.id, query: req.query });
      return res.json(payload);
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      return res.status(statusCode).json({ message: this.booksService.mapReadErrorMessage(statusCode), ...(error?.payload || {}) });
    }
  }

  async getGutenbergPreview(req, res) {
    try {
      const payload = await this.booksService.getGutenbergPreview({ gutenbergIdParam: req.params.gutenbergId });
      return res.json(payload);
    } catch (error) {
      if (Number(error?.statusCode) === 404) {
        return res.status(404).json({ message: 'Book preview not found for this Gutenberg ID.' });
      }
      return this.handleError(error, res, 'Server error fetching Gutenberg preview.');
    }
  }

  async readGutenbergBook(req, res) {
    try {
      const payload = await this.booksService.readGutenbergBook({ gutenbergIdParam: req.params.gutenbergId, query: req.query });
      return res.json(payload);
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      return res.status(statusCode).json({ message: this.booksService.mapReadErrorMessage(statusCode), ...(error?.payload || {}) });
    }
  }

  async readBookBySource(req, res) {
    try {
      const payload = await this.booksService.readBookBySource({ query: req.query });
      return res.json(payload);
    } catch (error) {
      return this.handleError(error, res, 'Unable to read source.');
    }
  }

  handleError(error, res, fallbackMessage) {
    const statusCode = Number(error?.statusCode) || 500;
    return res.status(statusCode).json({ message: error?.message || fallbackMessage, ...(error?.payload || {}) });
  }
}
