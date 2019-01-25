// pagination starts
function Pagination($content, $wrap, options) {
    this.$wrap = $wrap;
    this.$content = $content;
    this.options = $.extend({}, Pagination.defaultOptions, options);
    this.init();
}
Pagination.defaultOptions = {
    size: 8
};
Pagination.prototype.init = function () {
    var totalItemNum = this.$content.children().length;
    var totalPageNum = this.totalPageNum = Math.ceil(totalItemNum / this.options.size);
    this.currentPage = 1;
    this.$wrap.empty();
    this.$content.children(':gt(' + (this.options.size - 1) + ')').hide();
    this.$wrap.append([
        '<span class="page_box">',
        '<a class="prev">Prev</a>',
        '<span class="num">',
        '</span>',
        '<a class="next">Next</a>',
        '</span>'
    ].join(''));
    for (var i = 0; i < totalPageNum; i++) {
        var $btn = $('<span class="page-item">' + (i + 1) + '</span>');
        $btn.data('page', i + 1);
        this.$wrap.find('.num').append($btn);
    }
    this.$wrap.find('.num').children().eq(0).addClass('current');
    this.initEvents();
};
Pagination.prototype.initEvents = function () {
    var _this = this;
    var $prev = this.$wrap.find('.prev');
    var $next = this.$wrap.find('.next');
    var $num = this.$wrap.find('.num');

    $prev.on('click', function () {
        _this.prev();
    });
    $next.on('click', function () {
        _this.next();
    });
    $num.on('click', '.page-item', function () {
        var page = $(this).data('page');
        _this.goTo(page);
    });
};
Pagination.prototype.prev = function () {
    this.goTo(this.currentPage - 1);
};
Pagination.prototype.next = function () {
    this.goTo(this.currentPage + 1);
};
Pagination.prototype.goTo = function (num) {
    if (typeof num !== 'number') {
        throw new Error('e');
    }
    if(num > this.totalPageNum || num <= 0) {
        return false;
    }

    this.currentPage = num;

    this.$wrap.find('.num')
        .children().eq(this.currentPage - 1)
        .addClass('current').siblings('.current')
        .removeClass('current');

    var left = (this.currentPage - 1) * this.options.size;
    var right = left + this.options.size;

    var $shouldShow = this.$content.children().filter(function (index) {
        return left <= index && index < right;
    });
    this.$content.children().hide();
    $shouldShow.show();
};

var pagi = new Pagination($('#content_page'), $('#wrap'));
// pagination ends

