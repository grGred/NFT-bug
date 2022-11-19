// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract TestERC721 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);

    // Mapping from token ID to owner address
    mapping(uint256 => address) private _owners;

    // Mapping owner address to token count
    mapping(address => uint256) private _balances;

    // Mapping from token ID to approved address
    mapping(uint256 => address) private _tokenApprovals;

    constructor() {
        _mint(msg.sender, 1);
    }

    function balanceOf(address owner) public view returns (uint256) {
        require(owner != address(0), 'ERC721: address zero is not a valid owner');
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _ownerOf(tokenId);
        require(owner != address(0), 'ERC721: invalid token ID');
        return owner;
    }

    function approve(address to, uint256 tokenId) public {
        address owner = ownerOf(tokenId);
        require(to != owner, 'ERC721: approval to current owner');

        require(msg.sender == owner, 'ERC721: approve caller is not token owner or approved for all');

        _approve(to, tokenId);
    }

    /**
     * @dev See {IERC721-getApproved}.
     */
    function getApproved(uint256 tokenId) public view returns (address) {
        _requireMinted(tokenId);

        return _tokenApprovals[tokenId];
    }

    /**
     * @dev See {IERC721-transferFrom}.
     */
    function transferFrom(address from, address to, uint256 tokenId) public {
        _transfer(from, to, tokenId);
    }

    /**
     * @dev Returns the owner of the `tokenId`. Does NOT revert if token doesn't exist
     */
    function _ownerOf(uint256 tokenId) internal view returns (address) {
        return _owners[tokenId];
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function _mint(address to, uint256 tokenId) internal {
        require(to != address(0), 'ERC721: mint to the zero address');
        require(!_exists(tokenId), 'ERC721: token already minted');

        require(!_exists(tokenId), 'ERC721: token already minted');

        unchecked {
            _balances[to] += 1;
        }

        _owners[tokenId] = to;

        emit Transfer(address(0), to, tokenId);
    }

    function _burn(uint256 tokenId) internal {
        address owner = ownerOf(tokenId);

        // Update ownership in case tokenId was transferred by `_beforeTokenTransfer` hook
        owner = ownerOf(tokenId);

        // Clear approvals
        delete _tokenApprovals[tokenId];

        unchecked {
            _balances[owner] -= 1;
        }
        delete _owners[tokenId];

        emit Transfer(owner, address(0), tokenId);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, 'ERC721: transfer from incorrect owner');
        require(to != address(0), 'ERC721: transfer to the zero address');

        // Check that tokenId was not transferred by `_beforeTokenTransfer` hook
        require(ownerOf(tokenId) == from, 'ERC721: transfer from incorrect owner');

        // Clear approvals from the previous owner
        delete _tokenApprovals[tokenId];

        unchecked {
            _balances[from] -= 1;
            _balances[to] += 1;
        }
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function _approve(address to, uint256 tokenId) internal {
        _tokenApprovals[tokenId] = to;
        emit Approval(ownerOf(tokenId), to, tokenId);
    }

    function _requireMinted(uint256 tokenId) internal view {
        require(_exists(tokenId), 'ERC721: invalid token ID');
    }
}
